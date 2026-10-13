import Link from "next/link";
import { adminUser } from "@/lib/supabase";
import { configured } from "@/lib/utils";
import { AdminLogin } from "@/components/admin-login";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const ready = configured();
  const user = ready ? await adminUser() : null;
  return <main className="min-h-screen bg-[#07111e]"><header className="border-b border-white/10"><div className="admin-container flex h-17 items-center justify-between"><Link href="/" className="font-bold tracking-tight">AGENTIC<span className="text-cyan-400">/</span>AI</Link><span className="font-mono text-xs tracking-widest text-slate-400 uppercase">Admin portal</span></div></header>{!ready ? <div className="site-container py-24 text-center"><h1 className="text-3xl font-bold">Supabase setup required</h1><p className="mt-4 text-slate-400">Add your Supabase credentials to .env.local and run the database migration to enable admin access.</p></div> : user ? <AdminDashboard email={user.email || "Admin"}/> : <AdminLogin/>}</main>;
}
