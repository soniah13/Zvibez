-- Charlie schema. Applied to Supabase in Phase 4.
-- All timestamps are timestamptz (stored UTC); display converts to Africa/Nairobi.

create extension if not exists pgcrypto;

create type track as enum ('Software Engineering', 'Data Science');
create type screening_status as enum ('ready', 'needs_review', 'incomplete');
create type flag_kind as enum ('verified', 'suspicious', 'inconclusive', 'info');
create type final_decision as enum ('pending', 'cleared', 'escalated', 'rejected_by_organizer');

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
  track track not null,
  challenge text not null,
  problem_description text not null,
  proposed_solution text not null,
  github_url text not null,
  github_owner text not null,
  github_repo text not null,
  demo_url text,
  technologies text[] not null,
  ai_tools_used text not null,
  external_resources text not null,
  testing_instructions text not null,
  media_url text,
  unique (github_owner, github_repo)
);

create table screening_results (
  submission_id uuid primary key references submissions on delete cascade,
  status screening_status not null,
  explanation text not null,
  missing jsonb not null default '[]',          -- [{field, reason}]
  final_decision final_decision not null default 'pending',
  decided_by uuid references organizers,
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table github_verifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  checked_at timestamptz not null default now(),
  accessible boolean not null,
  repo_created_at timestamptz,
  default_branch text,
  earliest_commit_at timestamptz,
  is_fork boolean,
  upstream text,
  has_readme boolean,
  commit_count int,
  raw jsonb                                     -- trimmed API evidence, never secrets
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
  resolved_at timestamptz
);

create table ai_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  report jsonb not null
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
create index on status_events (submission_id, created_at desc);

-- RLS: deny by default. Public submissions go through a server route using the service role;
-- organizers read/write through policies keyed on the organizers table.
alter table organizers enable row level security;
alter table submissions enable row level security;
alter table screening_results enable row level security;
alter table github_verifications enable row level security;
alter table screening_flags enable row level security;
alter table ai_reports enable row level security;
alter table review_notes enable row level security;
alter table status_events enable row level security;
-- Organizer policies are added in Phase 4 alongside authentication.
