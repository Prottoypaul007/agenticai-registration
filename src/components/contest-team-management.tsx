"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ContestTeam } from "@/lib/contest-teams";

type Notification = {
  id: string;
  source: string;
  reference: string;
  email_status: "pending" | "sending" | "sent" | "failed";
  email_error: string | null;
};
type Plan = { version: string; status: "draft" | "finalized"; teams: ContestTeam[]; finalized_at: string | null };
type State = { plan: Plan | null; notifications: Notification[] };

export function ContestTeamManagement() {
  const [data, setData] = useState<State>({ plan: null, notifications: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/contest-teams", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load contest teams.");
    setData(result);
    return result as State;
  }, []);
  useEffect(() => { void load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/contest-teams", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Contest team action failed.");
    return result;
  }

  async function generate() {
    setBusy(true); setMessage("");
    try {
      setData(await post({ action: "generate" }));
      setMessage("Teams are ready for review. No emails have been sent.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  async function sendNotifications(ids: string[]) {
    let sent = 0;
    let failed = 0;
    for (const [index, id] of ids.entries()) {
      setProgress(`Sending ${index + 1} of ${ids.length} emails...`);
      try {
        const result = await post({ action: "send_one", id });
        if (result.email_status === "sent") sent++;
        else failed++;
      } catch { failed++; }
    }
    await load();
    setProgress("");
    setMessage(`Email delivery complete: ${sent} sent, ${failed} failed or needing review.`);
  }

  async function finalize() {
    if (!data.plan || !window.confirm("Are you sure you want to finalize these teams and send email notifications to all participants?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await post({ action: "finalize", version: data.plan.version }) as State;
      setData(result);
      await sendNotifications(result.notifications.filter(item => item.email_status === "pending").map(item => item.id));
    } catch (error) { setMessage((error as Error).message); void load().catch(() => {}); }
    finally { setBusy(false); setProgress(""); }
  }

  async function sendSelected(status: "pending" | "failed") {
    setBusy(true); setMessage("");
    try { await sendNotifications(data.notifications.filter(item => item.email_status === status).map(item => item.id)); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); setProgress(""); }
  }

  const plan = data.plan;
  const counts = { pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const notification of data.notifications) counts[notification.email_status]++;
  const statusByReference = new Map(data.notifications.map(item => [`${item.source}:${item.reference}`, item]));

  return <section>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Contest Team Management</h2><p className="mt-2 text-sm text-slate-400">QR-confirmed participants from both registration groups. Form and review teams before sending any emails.</p></div>
      {!plan && <Button onClick={() => void generate()} disabled={busy || loading}>Form Teams</Button>}
      {plan?.status === "draft" && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void generate()} disabled={busy}>Regenerate Teams</Button><Button onClick={() => void finalize()} disabled={busy}>Send Emails</Button></div>}
    </div>
    {loading && <p className="text-sm text-slate-400">Loading contest teams...</p>}
    {message && <p role="status" className="mb-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">{message}</p>}
    {progress && <p role="status" className="mb-5 text-sm text-cyan-200">{progress}</p>}
    {plan?.status === "draft" && <p className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">Preview only. No team emails have been sent. Regenerating replaces this preview.</p>}
    {plan?.status === "finalized" && <div className="mb-6 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4"><p className="font-medium text-cyan-100">Teams finalized. Regeneration is locked.</p><p className="mt-2 text-sm text-slate-300">Email status: {counts.sent} sent · {counts.pending} pending · {counts.failed} failed · {counts.sending} sending or needing review.</p><div className="mt-4 flex flex-wrap gap-2">{counts.pending > 0 && <Button size="sm" disabled={busy} onClick={() => void sendSelected("pending")}>Send pending emails</Button>}{counts.failed > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void sendSelected("failed")}>Retry failed emails</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => void load().catch(error => setMessage(error.message))}>Refresh status</Button></div>{counts.sending > 0 && <p className="mt-3 text-xs text-amber-200">A sending status may indicate uncertain delivery. Check the sender mailbox before taking further action.</p>}</div>}
    {plan && <div className="mb-5 text-sm text-slate-400">{plan.teams.length} teams · {plan.teams.reduce((total, team) => total + team.members.length, 0)} participants</div>}
    {plan && <div className="grid gap-4 lg:grid-cols-2">{plan.teams.map(team => <div key={team.name} className="panel min-w-0 rounded-2xl p-5"><div className="flex items-baseline justify-between gap-3"><h3 className="text-lg font-semibold text-white">{team.name}</h3><span className="text-xs text-cyan-200">{team.members.length} members</span></div><div className="mt-4 space-y-3">{team.members.map(member => { const notification = statusByReference.get(`${member.source}:${member.reference}`); return <div key={`${member.source}:${member.reference}`} className="rounded-xl border border-white/10 bg-white/3 p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-white">{member.full_name}</strong><span className="text-xs text-slate-400">{member.source === "batch14" ? "Batch 14" : "Outsider"}{notification ? ` · ${notification.email_status}` : ""}</span></div><p className="mt-1 break-all text-slate-300">{member.email}</p><p className="mt-1 text-slate-400">{member.phone || "No contact number"}</p>{notification?.email_status === "failed" && notification.email_error && <p className="mt-2 text-xs text-rose-300">{notification.email_error}</p>}</div>; })}</div></div>)}</div>}
  </section>;
}
