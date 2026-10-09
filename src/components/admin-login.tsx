"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { LockKeyhole, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) setError("Sign-in failed. Check your credentials and admin access.");
    else {
      const check = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!check.ok) { await client.auth.signOut(); setError("This account is not authorized as an administrator."); }
      else router.refresh();
    }
    setLoading(false);
  }
  return <div className="site-container flex min-h-[calc(100vh-68px)] items-center justify-center py-12"><form onSubmit={submit} className="panel w-full max-w-md rounded-3xl p-8 md:p-10"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><LockKeyhole/></span><h1 className="mt-6 text-2xl font-bold">Admin sign in</h1><p className="mt-2 text-sm leading-6 text-slate-400">Access is limited to accounts added to the admin allowlist.</p><label className="mt-7 block text-sm text-slate-200">Email<Input className="mt-2" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label><label className="mt-5 block text-sm text-slate-200">Password<Input className="mt-2" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}<Button className="mt-7 w-full" disabled={loading}>{loading && <Loader2 size={16} className="animate-spin"/>}Sign in</Button></form></div>;
}
