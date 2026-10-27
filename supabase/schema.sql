-- Charlie schema. Applied to Supabase in Phase 4. Not applied yet.
-- All timestamps are timestamptz (stored UTC); display converts to Africa/Nairobi.
--
-- Design rule: anything that describes what teams build (tracks, disciplines, formats, artifact types,
-- technologies) lives in reference tables or free-form tags, never in enums. Adding a new value is an INSERT,
-- not a migration. Evidence requirements are stored as a versioned policy document, so organizers can
-- change what a format expects without a deploy.

create extension if not exists pgcrypto;

create type screening_status as enum ('ready', 'needs_review', 'incomplete');
create type flag_kind as enum ('verified', 'suspicious', 'inconclusive', 'info');
create type final_decision as enum ('pending', 'cleared', 'escalated', 'rejected_by_organizer');

-- ---------------------------------------------------------------------------------------------
-- Reference data. Seeded below; organizers add rows as the event rules evolve.
-- ---------------------------------------------------------------------------------------------

-- Official competition tracks. Kept separate from disciplines and formats. Changing them is an organizer decision.
create table tracks (
  id text primary key,                          -- e.g. 'Software Engineering'
  label text not null,
  active boolean not null default true
);

create table disciplines (
  id text primary key,                          -- e.g. 'design'
  label text not null,
  active boolean not null default true
);

create table project_formats (
  id text primary key,                          -- e.g. 'backend_api'
  label text not null,
  active boolean not null default true
);

create table artifact_types (
  id text primary key,                          -- e.g. 'design_prototype'
  label text not null,
  -- Work product whose creation time matters for the event window. Deployments and videos only show existence.
  timeline_relevant boolean not null default true,
  active boolean not null default true
);

-- Technology tags are open-ended. Teams may add any value; nothing is rejected for being unfamiliar.
-- slug is the lower-cased, whitespace-collapsed name, so 'React' and 'react' are one tag.
create table technologies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and char_length(slug) between 1 and 50),
  name text not null check (char_length(name) between 1 and 50),
  category text,                                -- optional grouping for pickers: language, framework, database, design, analytics, ml...
  is_custom boolean not null default true,      -- false for the suggested list below
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Organizers and submissions
-- ---------------------------------------------------------------------------------------------

create table organizers (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  role text not null default 'reviewer' check (role in ('admin', 'reviewer'))
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_name text not null check (char_length(team_name) between 1 and 100),
  members jsonb not null,                       -- [{name, email?}]
  track text not null references tracks,
  other_discipline text check (char_length(other_discipline) <= 200),
  challenge text not null,
  problem_description text not null,
  proposed_solution text not null,
  -- Optional: not every deliverable lives in GitHub. Whether one is expected depends on the project format.
  github_url text,
  github_owner text,
  github_repo text,
  demo_url text,
  ai_tools_used text not null,
  external_resources text not null,
  testing_instructions text not null,
  media_url text,
  check ((github_url is null) = (github_owner is null) and (github_url is null) = (github_repo is null))
);
create unique index submissions_repo_unique on submissions (github_owner, github_repo) where github_url is not null;

-- A project can span several disciplines and formats.
create table submission_disciplines (
  submission_id uuid not null references submissions on delete cascade,
  discipline_id text not null references disciplines,
  primary key (submission_id, discipline_id)
);

create table submission_formats (
  submission_id uuid not null references submissions on delete cascade,
  format_id text not null references project_formats,
  primary key (submission_id, format_id)
);

create table submission_technologies (
  submission_id uuid not null references submissions on delete cascade,
  technology_id uuid not null references technologies,
  primary key (submission_id, technology_id)
);

-- Every other piece of evidence a team links: deployments, prototypes, notebooks, dashboards, model cards, docs.
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  type text not null references artifact_types,
  url text not null check (url ~* '^https?://[^@/]+(/|$)' and char_length(url) <= 500),  -- http(s) only, no user:password@
  description text not null check (char_length(description) between 1 and 300),
  timeline_evidence text check (char_length(timeline_evidence) <= 1000),     -- the team's own note, unverified
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on artifacts (submission_id);

-- A human organizer's review of an artifact. Charlie never sets verified_by_organizer.
create table artifact_reviews (
  artifact_id uuid primary key references artifacts on delete cascade,
  status text not null default 'unreviewed' check (status in ('unreviewed', 'verified_by_organizer', 'concern', 'could_not_access')),
  creation_time_note text,                      -- e.g. "Figma version history starts 07:42 EAT"
  reviewed_by uuid references organizers,
  reviewed_at timestamptz
);

-- ---------------------------------------------------------------------------------------------
-- Screening
-- ---------------------------------------------------------------------------------------------

-- Event rules as a versioned document: window, thresholds, and the evidence each format and track expects
-- (see ScreeningPolicy in src/lib/screening/policy.ts). Exactly one row is active.
create table event_policies (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  policy jsonb not null,
  note text,
  created_by uuid references organizers,
  created_at timestamptz not null default now(),
  active boolean not null default false
);
create unique index event_policies_one_active on event_policies (active) where active;

create table screening_results (
  submission_id uuid primary key references submissions on delete cascade,
  status screening_status not null,
  explanation text not null,
  missing jsonb not null default '[]',          -- [{field, reason}]
  requirements jsonb not null default '[]',     -- [{key, label, level, outcome, detail}] expected evidence and what was found
  policy_version int references event_policies (version),
  final_decision final_decision not null default 'pending',
  decided_by uuid references organizers,
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table github_verifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  checked_at timestamptz not null default now(),
  accessible boolean,                           -- null = unknown (the check could not be completed)
  repo_created_at timestamptz,
  default_branch text,
  earliest_commit_at timestamptz,
  is_fork boolean,
  upstream text,
  has_readme boolean,
  commit_count int,
  raw jsonb                                     -- trimmed API evidence, never secrets
);

-- What the evidence providers recorded per artifact. Only an adapter that actually checked a creation time
-- may set creation_time_verified. The manual provider never does.
create table artifact_verifications (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts on delete cascade,
  checked_at timestamptz not null default now(),
  provider text not null,                       -- 'manual', or a future adapter id
  verification text not null check (verification in ('manual_review', 'not_applicable', 'verified', 'failed')),
  creation_time_verified boolean not null default false,
  note text not null
);

create table screening_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  code text not null,
  kind flag_kind not null,
  title text not null,
  detail text not null,
  evidence_url text,
  resolved boolean not null default false,
  resolved_by uuid references organizers,
  resolution_note text,
  resolved_at timestamptz,
  unique (submission_id, code)
);

-- Durable AI report cache. A report is reused while the evidence fingerprint and prompt version are unchanged.
create table ai_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  prompt_version text not null,
  evidence_fingerprint text not null,
  report jsonb not null,
  unique (submission_id, evidence_fingerprint, prompt_version, model)
);

create table review_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  author uuid not null references organizers,
  created_at timestamptz not null default now(),
  body text not null check (char_length(body) <= 4000)
);

create table status_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  created_at timestamptz not null default now(),
  actor uuid references organizers,             -- null = Charlie (automated)
  from_status screening_status,
  to_status screening_status not null,
  reason text
);

create index on screening_flags (submission_id);
create index on github_verifications (submission_id, checked_at desc);
create index on artifact_verifications (artifact_id, checked_at desc);
create index on ai_reports (submission_id, created_at desc);
create index on status_events (submission_id, created_at desc);
create index on submission_technologies (technology_id);

-- ---------------------------------------------------------------------------------------------
-- Seed data: starting vocabularies. Extend with INSERTs, not migrations.
-- ---------------------------------------------------------------------------------------------

insert into tracks (id, label) values
  ('Software Engineering', 'Software Engineering'),
  ('Data Science', 'Data Science');
-- ORGANIZER DECISION: whether designers, analysts and others get their own official tracks. Until decided,
-- only the two confirmed tracks exist.

insert into disciplines (id, label) values
  ('frontend', 'Frontend development'),
  ('backend', 'Backend development and APIs'),
  ('fullstack', 'Full-stack development'),
  ('mobile_desktop_cli', 'Mobile, desktop or command-line applications'),
  ('design', 'UI/UX design and prototyping'),
  ('analytics_bi', 'Data analytics and business intelligence'),
  ('data_science', 'Data science and statistical analysis'),
  ('machine_learning', 'Machine learning and predictive modelling'),
  ('ai_applications', 'AI applications and intelligent systems'),
  ('data_engineering', 'Data engineering and data pipelines'),
  ('automation_devops', 'Automation, DevOps and cloud engineering'),
  ('embedded_iot', 'Embedded systems and IoT'),
  ('other', 'Other (describe)');

insert into project_formats (id, label) values
  ('web_app', 'Web application or frontend interface'),
  ('backend_api', 'Backend service or API'),
  ('mobile_desktop_cli', 'Mobile, desktop or command-line application'),
  ('dashboard_bi', 'Dashboard or business intelligence report'),
  ('data_analysis', 'Data analysis or research project'),
  ('notebook', 'Jupyter notebook or reproducible analysis'),
  ('ml_ai', 'Machine learning model or AI-powered application'),
  ('pipeline_automation', 'Data pipeline or automation workflow'),
  ('design_prototype', 'UI/UX design or interactive prototype'),
  ('other', 'Other technical deliverable');

insert into artifact_types (id, label, timeline_relevant) values
  ('github_repository', 'GitHub repository', true),
  ('deployed_app', 'Deployed application', false),
  ('api_docs', 'API documentation', false),
  ('api_collection', 'API testing collection', true),
  ('design_prototype', 'Design file or interactive prototype', true),
  ('design_documentation', 'User flows or design documentation', true),
  ('dashboard', 'Dashboard or report', true),
  ('notebook', 'Notebook', true),
  ('dataset_documentation', 'Dataset or data provenance documentation', true),
  ('model_card', 'Model card', true),
  ('evaluation_report', 'Evaluation or methodology report', true),
  ('reproducible_script', 'Reproducible script or pipeline configuration', true),
  ('demo_video', 'Demo video or screenshots', false),
  ('other', 'Other project evidence', true);

-- Suggested technologies only. Teams add their own; nothing here is an approved list.
insert into technologies (slug, name, category, is_custom) values
  ('react', 'React', 'framework', false), ('vue', 'Vue', 'framework', false), ('angular', 'Angular', 'framework', false),
  ('node.js', 'Node.js', 'runtime', false), ('django', 'Django', 'framework', false), ('fastapi', 'FastAPI', 'framework', false),
  ('postgresql', 'PostgreSQL', 'database', false), ('mongodb', 'MongoDB', 'database', false),
  ('python', 'Python', 'language', false), ('r', 'R', 'language', false), ('sql', 'SQL', 'language', false),
  ('power bi', 'Power BI', 'analytics', false), ('tableau', 'Tableau', 'analytics', false), ('figma', 'Figma', 'design', false),
  ('tensorflow', 'TensorFlow', 'ml', false), ('pytorch', 'PyTorch', 'ml', false), ('scikit-learn', 'scikit-learn', 'ml', false),
  ('dbt', 'dbt', 'data engineering', false), ('airflow', 'Airflow', 'data engineering', false),
  ('docker', 'Docker', 'devops', false), ('aws', 'AWS', 'cloud', false), ('firebase', 'Firebase', 'cloud', false);

-- ---------------------------------------------------------------------------------------------
-- RLS: deny by default. Public submissions go through a server route using the service role;
-- organizers read/write through policies keyed on the organizers table.
-- ---------------------------------------------------------------------------------------------
alter table tracks enable row level security;
alter table disciplines enable row level security;
alter table project_formats enable row level security;
alter table artifact_types enable row level security;
alter table technologies enable row level security;
alter table organizers enable row level security;
alter table submissions enable row level security;
alter table submission_disciplines enable row level security;
alter table submission_formats enable row level security;
alter table submission_technologies enable row level security;
alter table artifacts enable row level security;
alter table artifact_reviews enable row level security;
alter table artifact_verifications enable row level security;
alter table event_policies enable row level security;
alter table screening_results enable row level security;
alter table github_verifications enable row level security;
alter table screening_flags enable row level security;
alter table ai_reports enable row level security;
alter table review_notes enable row level security;
alter table status_events enable row level security;
-- Organizer policies are added in Phase 4 alongside authentication.
