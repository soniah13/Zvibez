import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Charlie · Zinduathon 3.0 Screening",
  description: "Project screening and verification assistant for Zinduathon 3.0 organizers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Charlie <span className="font-normal text-slate-500">· Zinduathon 3.0</span>
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/submit" className="text-slate-600 hover:text-slate-900">Submit project</Link>
              <Link href="/dashboard" className="text-slate-600 hover:text-slate-900">Organizer dashboard</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
