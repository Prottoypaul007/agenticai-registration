"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowDownToLine, ArrowRight, BarChart3, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, LogOut, Mail, Menu, QrCode, Search, Settings2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PaymentNumberSettings } from "@/components/payment-number-settings";
import { CheckinScanner } from "@/components/checkin-scanner";
import { RegistrationReview } from "@/components/registration-review";
import { Batch14Dashboard } from "@/components/batch14-dashboard";
import { PresentList } from "@/components/present-list";
import { ContestTeamManagement } from "@/components/contest-team-management";
import { StudentSearch } from "@/components/student-search";
import { AdminMailbox } from "@/components/admin-mailbox";
import type { EventSettings } from "@/lib/validation";

type Participant = Record<string, unknown> & {
  id: string; full_name: string; email: string; institution: string; department: string;
  programming_level: string; attendance: string; registration_status: string; created_at: string;
  payment_status: string; payment_amount_bdt: number; completion_status: string; refund_status: string;
};
type Stats = {
  total: number; confirmed: number; pending: number; day1: number; day2: number; both: number;
  rejected: number; qr_pending_review: number; qr_sent: number; qr_failed: number;
  payment_unverified: number; refunds_pending: number; refunds_sent: number;
  amount_verified_bdt: number; amount_refunded_bdt: number; daily: { date: string; count: number }[];
  active_total: number; batch14: { total: number; pending: number; sent: number; failed: number };
};
const date = (value: string) => new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const localValue = (value: string | null) => value ? new Date(new Date(value).getTime() + 6 * 3600000).toISOString().slice(0, 16) : "";
const isoValue = (value: string) => value ? new Date(`${value}:00+06:00`).toISOString() : null;
const money = (value: number) => `৳${Number(value || 0).toLocaleString("en-US")}`;
type Tab = "overview" | "review" | "batch14" | "participants" | "search" | "mailbox" | "checkin" | "present" | "teams" | "export" | "settings";
const navigation = [
  { title: "Workspace", items: [["overview", BarChart3, "Overview"]] },
  { title: "Registration", items: [["review", ClipboardCheck, "Outside review"], ["batch14", Users, "Batch 14 review"], ["search", Search, "Search students"], ["participants", Users, "Outside records"]] },
  { title: "Workshop", items: [["checkin", QrCode, "Check-in scanner"], ["present", ClipboardCheck, "Present students"], ["teams", Users, "Contest teams"]] },
  { title: "Communication & data", items: [["mailbox", Mail, "Mailbox"], ["export", ArrowDownToLine, "Export CSV"]] },
  { title: "Configuration", items: [["settings", Settings2, "Event settings"]] }
] as const;
const tabCopy: Record<Tab, { title: string; description: string }> = {
  overview: { title: "Overview", description: "Registration activity and the tasks that need attention." },
  review: { title: "Outside registration review", description: "Verify payments, approve registrations, and send QR tickets." },
  batch14: { title: "Batch 14 review", description: "Sync Google Form responses and review Batch 14 payments." },
  search: { title: "Search students", description: "Find a student by name, contact details, or transaction ID." },
  participants: { title: "Outside records", description: "Browse participant details, completion, and refund records." },
  checkin: { title: "Check-in scanner", description: "Scan QR tickets and record workshop attendance." },
  present: { title: "Present students", description: "See everyone marked present from both registration groups." },
  teams: { title: "Contest teams", description: "Review team assignments and notification status." },
  mailbox: { title: "Mailbox", description: "Send individual email updates and resources to participants." },
  export: { title: "Export registrations", description: "Download a CSV for both groups or either group separately." },
  settings: { title: "Event settings", description: "Manage registration availability, capacity, and payment details." }
};

export function AdminDashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [institution, setInstitution] = useState("");
  const [level, setLevel] = useState("");
  const [attendance, setAttendance] = useState("");
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [refundReference, setRefundReference] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportGroup, setExportGroup] = useState<"all" | "outsiders" | "batch14">("all");
  const [exporting, setExporting] = useState(false);
  const router = useRouter();
  const loadStats = useCallback(async () => {
    const response = await fetch("/api/admin/stats", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.payment_unverified === "number") setStats(data);
      else setMessage("Apply database migration 003_payment_and_refunds.sql to enable payment management.");
    }
  }, []);
  const loadParticipants = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), search, institution, level, attendance });
    const response = await fetch(`/api/admin/participants?${params}`, { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setParticipants(data.participants); setCount(data.count); }
  }, [page, search, institution, level, attendance]);
  useEffect(() => { if (tab === "overview") void loadStats(); }, [tab, loadStats]);
  useEffect(() => { if (tab === "participants") loadParticipants(); }, [tab, loadParticipants]);
  useEffect(() => {
    if (tab === "settings" && !settings) fetch("/api/admin/settings", { cache: "no-store" }).then(async r => {
      if (!r.ok) { setMessage("Apply database migration 003_payment_and_refunds.sql to enable payment settings."); return; }
      setSettings(await r.json());
    });
  }, [tab, settings]);
  async function action(id: string, value: string) {
    if (value === "mark_refunded" && !refundReference.trim()) { setMessage("Enter the bank transfer reference first."); return; }
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/participants", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: value, refund_reference: value === "mark_refunded" ? refundReference : undefined })
    });
    const result = await response.json();
    if (response.ok) {
      setMessage(value === "mark_refunded" ? "Refund recorded. This does not send a bank transfer." : "Participant updated.");
      setSelected(null); setRefundReference("");
      await Promise.all([loadParticipants(), loadStats()]);
    } else setMessage(result.error || "Unable to update participant.");
    setBusy(false);
  }
  async function saveSettings() {
    if (!settings) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    const data = await response.json();
    setMessage(response.ok ? "Settings saved." : data.error || "Unable to save settings.");
    setBusy(false);
  }
  async function signOut() {
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await client.auth.signOut(); router.refresh();
  }
  async function downloadExport() {
    setExporting(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/export?group=${exportGroup}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Unable to export registrations.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `agentic-workshop-${exportGroup}-registrations.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      void loadStats();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export registrations.");
    } finally {
      setExporting(false);
    }
  }
  const chooseTab = (next: Tab) => { setTab(next); setMessage(""); setMenuOpen(false); };
  const awaitingReview = stats ? stats.qr_pending_review + stats.batch14.pending : 0;
  const statCards = stats ? [
    { label: "Total registrations", value: stats.active_total, detail: `${stats.total} outside · ${stats.batch14.total} Batch 14`, icon: Users },
    { label: "Awaiting review", value: awaitingReview, detail: `${stats.qr_pending_review} outside · ${stats.batch14.pending} Batch 14`, icon: ClipboardCheck },
    { label: "QR tickets sent", value: stats.qr_sent + stats.batch14.sent, detail: `${stats.qr_failed + stats.batch14.failed} delivery issues`, icon: QrCode },
    { label: "Refunds pending", value: stats.refunds_pending, detail: `${stats.refunds_sent} already recorded`, icon: ArrowDownToLine }
  ] : [];
  return <div className="admin-container py-6 lg:py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="section-kicker">Workshop administration</p><h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Admin workspace</h1><p className="mt-1 text-sm text-slate-400">Signed in as <span className="text-slate-200">{email}</span></p></div><Button variant="outline" size="sm" onClick={signOut}><LogOut size={16}/> Sign out</Button></div>
    <div className="mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/4 px-4 py-3 lg:hidden"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-300">Current section</p><p className="text-sm font-semibold text-white">{tabCopy[tab].title}</p></div><Button type="button" variant="outline" size="sm" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={17}/> : <Menu size={17}/>} Sections</Button></div>
    <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start">
    <aside id="admin-navigation" className={`${menuOpen ? "block" : "hidden"} panel rounded-2xl p-3 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto`}>
      <nav aria-label="Admin sections" className="space-y-5">{navigation.map(group => <div key={group.title}><p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[.17em] text-slate-500">{group.title}</p><div className="space-y-1">{group.items.map(([key, Icon, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => chooseTab(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${tab === key ? "bg-cyan-400 text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,.16)]" : "text-slate-300 hover:bg-white/8 hover:text-white"}`}><Icon size={17} className="shrink-0"/><span className="min-w-0 flex-1">{label}</span>{key === "review" && stats && stats.qr_pending_review > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === key ? "bg-slate-950/12" : "bg-amber-400/12 text-amber-200"}`}>{stats.qr_pending_review}</span>}{key === "batch14" && stats && stats.batch14.pending > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === key ? "bg-slate-950/12" : "bg-amber-400/12 text-amber-200"}`}>{stats.batch14.pending}</span>}</button>)}</div></div>)}</nav>
    </aside>
    <div className="min-w-0">
    <div className="mb-6 overflow-hidden rounded-2xl border border-cyan-400/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.13),transparent_42%),linear-gradient(135deg,#10233a,#0b192a)] px-5 py-6 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Admin / {tabCopy[tab].title}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{tabCopy[tab].title}</h2><p className="mt-1 max-w-2xl text-sm text-slate-300">{tabCopy[tab].description}</p></div>{stats && <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-right"><p className="text-xs text-slate-400">Registered participants</p><p className="mt-0.5 text-2xl font-semibold text-white">{stats.active_total}</p></div>}</div></div>
    {message && <p role="status" className="mb-6 rounded-xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">{message}</p>}
    {tab === "review" && <RegistrationReview onUpdated={() => { void loadStats(); void loadParticipants(); }}/>}
    {tab === "batch14" && <Batch14Dashboard onUpdated={() => { void loadStats(); }}/>}
    {tab === "search" && <StudentSearch/>}
    {tab === "mailbox" && <AdminMailbox/>}
    {tab === "overview" && (stats ? <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(({ label, value, detail, icon: Icon }) => <div key={label} className="panel rounded-2xl p-5"><div className="flex items-start justify-between gap-2"><p className="text-sm text-slate-300">{label}</p><span className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><Icon size={18}/></span></div><p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
        <section className="panel rounded-2xl p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="section-kicker">Action queue</p><h3 className="mt-1 text-lg font-semibold">Continue your work</h3></div><span className="text-xs text-slate-500">Choose a section to open it</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{([
          { key: "review", title: "Outside review", detail: `${stats.qr_pending_review} awaiting QR review`, icon: ClipboardCheck },
          { key: "batch14", title: "Batch 14 review", detail: `${stats.batch14.pending} awaiting review`, icon: Users },
          { key: "checkin", title: "Check-in scanner", detail: "Record workshop attendance", icon: QrCode },
          { key: "mailbox", title: "Mailbox", detail: "Send updates and resources", icon: Mail }
        ] as const).map(({ key, title, detail, icon: Icon }) => <button key={key} type="button" onClick={() => chooseTab(key)} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/5"><span className="rounded-lg bg-white/6 p-2 text-cyan-300"><Icon size={18}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{title}</span><span className="block text-xs text-slate-400">{detail}</span></span><ArrowRight size={16} className="shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-300"/></button>)}</div></section>
        <section className="panel rounded-2xl p-5 sm:p-6"><p className="section-kicker">At a glance</p><h3 className="mt-1 text-lg font-semibold">Workshop records</h3><dl className="mt-4 divide-y divide-white/8 text-sm">{[
          ["Outside / Batch 14", `${stats.total} / ${stats.batch14.total}`],
          ["Confirmed outside", stats.confirmed],
          ["Payment checks open", stats.payment_unverified],
          ["Registrations rejected", stats.rejected],
          ["Verified payments", money(stats.amount_verified_bdt)],
          ["Refunded", money(stats.amount_refunded_bdt)]
        ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-400">{label}</dt><dd className="font-semibold text-white">{value}</dd></div>)}</dl></section>
      </div>
      <section className="panel rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-2"><CalendarClock size={18} className="text-cyan-400"/><div><h3 className="font-semibold">Registrations over time</h3><p className="text-xs text-slate-500">Daily signups for the outside registration site</p></div></div><div className="mt-7 flex min-h-42 items-end gap-2 overflow-x-auto">{stats.daily.length ? [...stats.daily].reverse().map(d => <div key={d.date} className="flex min-w-10 flex-1 flex-col items-center gap-2"><span className="text-xs text-slate-400">{d.count}</span><div className="w-full rounded-t bg-cyan-400/70" style={{ height: `${Math.max(8, d.count / Math.max(...stats.daily.map(x => x.count)) * 110)}px` }}/><span className="text-[10px] text-slate-500">{d.date.slice(5)}</span></div>) : <p className="self-center text-sm text-slate-400">No registrations yet.</p>}</div></section>
      <details className="panel rounded-2xl p-5 text-sm"><summary className="cursor-pointer font-semibold text-slate-200">More registration statistics</summary><dl className="mt-4 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 xl:grid-cols-3">{[
        ["Outside pending", stats.pending], ["Day 1 participants", stats.day1], ["Day 2 participants", stats.day2],
        ["Both days", stats.both], ["QR delivery failed", stats.qr_failed + stats.batch14.failed], ["Refunds sent", stats.refunds_sent]
      ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-white">{value}</dd></div>)}</dl></details>
    </div> : <p className="panel rounded-2xl p-6 text-sm text-slate-400">Loading statistics...</p>)}
    {tab === "participants" && <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Participants <span className="text-slate-500">({count})</span></h2><Button variant="outline" size="sm" onClick={() => setTab("export")}><ArrowDownToLine size={16}/> Export registrations</Button></div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="relative"><Search size={16} className="absolute top-3.5 left-3 text-slate-500"/><Input aria-label="Search by name" placeholder="Search by name" className="pl-9" value={search} onChange={e => { setPage(0); setSearch(e.target.value); }}/></label><Input aria-label="Filter by institution" placeholder="Institution" value={institution} onChange={e => { setPage(0); setInstitution(e.target.value); }}/><Select aria-label="Filter by programming level" value={level} onChange={e => { setPage(0); setLevel(e.target.value); }}><option value="">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></Select><Select aria-label="Filter by attendance" value={attendance} onChange={e => { setPage(0); setAttendance(e.target.value); }}><option value="">All attendance</option><option>Both Days</option><option>Day 1 Only</option><option>Day 2 Only</option></Select></div>
      <p className="mb-2 text-xs text-slate-500 xl:hidden">Swipe sideways to view all participant columns.</p>
      <div className="panel overflow-x-auto rounded-2xl"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-white/10 bg-white/3 text-xs uppercase text-slate-400"><tr>{["Participant","Institution","Workshop","Payment & registration","QR & refund","Registered",""].map(h => <th key={h} className="px-4 py-4 font-medium">{h}</th>)}</tr></thead><tbody>{participants.map(p => <tr key={p.id} className="border-b border-white/7 text-slate-300 transition-colors last:border-0 hover:bg-white/3"><td className="px-4 py-4"><span className="block font-medium text-white">{p.full_name}</span><span className="block max-w-52 truncate text-xs text-slate-400" title={p.email}>{p.email}</span></td><td className="px-4 py-4"><span className="block max-w-44 truncate" title={p.institution}>{p.institution}</span><span className="block text-xs text-slate-500">{p.department}</span></td><td className="px-4 py-4"><span className="block">{p.attendance}</span><span className="block text-xs text-slate-500">{p.programming_level}</span></td><td className="px-4 py-4 capitalize"><span className="block">{p.payment_status || "—"}</span><span className="block text-xs text-slate-500">{p.registration_status}</span></td><td className="px-4 py-4 capitalize"><span className="block">{String(p.qr_status || "pending_review").replaceAll("_", " ")}</span><span className="block text-xs text-slate-500">Refund: {p.refund_status?.replaceAll("_", " ") || "—"}</span></td><td className="whitespace-nowrap px-4 py-4 text-xs">{date(p.created_at)}</td><td className="px-4 py-4"><button type="button" className="font-medium text-cyan-300 hover:underline" onClick={() => { setSelected(p); setRefundReference(""); }}>Details</button></td></tr>)}</tbody></table>{participants.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No participants found.</p>}</div>
      <div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button></div>
    </div>}
    {tab === "checkin" && <CheckinScanner/>}
    {tab === "present" && <PresentList/>}
    {tab === "teams" && <ContestTeamManagement/>}
    {tab === "export" && <div className="panel max-w-2xl rounded-2xl p-6 md:p-8"><h2 className="text-2xl font-semibold">Export registrations</h2><p className="mt-2 text-sm text-slate-400">Download a CSV file for Excel or Google Sheets. Batch 14 data is synced from the Google Sheet before it is exported.</p><label className="mt-6 block text-sm font-medium text-slate-200" htmlFor="export-group">Registrations to include</label><Select id="export-group" className="mt-2 w-full" value={exportGroup} onChange={e => setExportGroup(e.target.value as typeof exportGroup)}><option value="all">Outsiders and Batch 14</option><option value="outsiders">Outsiders only</option><option value="batch14">Batch 14 only</option></Select><Button className="mt-5" disabled={exporting} onClick={() => void downloadExport()}><ArrowDownToLine size={16}/>{exporting ? "Preparing CSV..." : "Download CSV"}</Button></div>}
    {tab === "settings" && settings && <div className="panel mb-5 max-w-3xl rounded-2xl border border-amber-400/25 p-6"><label className="flex items-start gap-3 text-sm text-white"><input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" checked={settings.outsider_registration_enabled} onChange={event => setSettings({ ...settings, outsider_registration_enabled: event.target.checked })}/><span><strong>Open remaining seats to outside registrations</strong><span className="mt-1 block text-slate-400">Both groups count toward the 45-registration website closing threshold. The Batch 14 Google Form can continue receiving responses. Save settings below after changing this.</span></span></label></div>}
    {tab === "settings" && (settings ? <div className="panel max-w-3xl rounded-2xl p-7 md:p-9"><h2 className="text-xl font-semibold">Event settings</h2><p className="mt-2 text-sm text-slate-400">Times use Bangladesh time (UTC+6). Registration stays unavailable until at least one payment number is entered.</p><div className="mt-7 grid gap-5 sm:grid-cols-2"><label className="text-sm text-slate-300">Registration opens<Input className="mt-2" type="datetime-local" value={localValue(settings.registration_opens_at)} onChange={e => setSettings({ ...settings, registration_opens_at: isoValue(e.target.value) })}/></label><label className="text-sm text-slate-300">Registration closes<Input className="mt-2" type="datetime-local" value={localValue(settings.registration_closes_at)} onChange={e => setSettings({ ...settings, registration_closes_at: isoValue(e.target.value) })}/></label><label className="text-sm text-slate-300">Capacity (blank for unlimited)<Input className="mt-2" type="number" min="1" value={settings.capacity ?? ""} onChange={e => setSettings({ ...settings, capacity: e.target.value ? Number(e.target.value) : null })}/></label><label className="text-sm text-slate-300">Event time<Input className="mt-2" value={settings.event_time} onChange={e => setSettings({ ...settings, event_time: e.target.value })}/></label><label className="text-sm text-slate-300 sm:col-span-2">Venue<Input className="mt-2" value={settings.venue} onChange={e => setSettings({ ...settings, venue: e.target.value })}/></label><label className="text-sm text-slate-300 sm:col-span-2">bKash number<Input className="mt-2" type="tel" placeholder="01XXXXXXXXX" value={settings.bkash_merchant_number ?? ""} onChange={e => setSettings({ ...settings, bkash_merchant_number: e.target.value || null })}/><span className="mt-2 block text-xs text-slate-500">Participants can pay to this number and enter their transaction ID. Verify payments in the matching account records.</span></label></div><div className="mt-6"><PaymentNumberSettings settings={settings} onChange={setSettings}/></div><div className="mt-7 space-y-4 border-t border-white/10 pt-6">{[["approval_required","Require admin approval after payment verification"],["allow_single_day","Allow single-day registration"],["require_iit_student_id","Require student ID for IIT students"]].map(([key,label]) => <label key={key} className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={Boolean(settings[key as keyof EventSettings])} onChange={e => setSettings({ ...settings, [key]: e.target.checked })}/>{label}</label>)}</div><Button className="mt-8" disabled={busy} onClick={saveSettings}>Save settings</Button></div> : <p className="text-slate-400">Loading settings...</p>)}
    {selected && <div role="dialog" aria-modal="true" aria-label="Participant details" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelected(null)}><div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 md:p-8" onClick={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{selected.full_name}</h2><p className="mt-1 text-sm text-slate-400">{selected.email}</p></div><button aria-label="Close details" onClick={() => setSelected(null)}><X/></button></div><dl className="mt-6 grid gap-4 sm:grid-cols-2">{Object.entries(selected).filter(([key]) => !["id","full_name","email","updated_at"].includes(key)).map(([key,value]) => <div key={key} className="border-b border-white/10 pb-3"><dt className="text-xs text-slate-500 capitalize">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm text-slate-200">{key.endsWith("_at") && value ? date(String(value)) : Array.isArray(value) ? value.join(", ") : String(value ?? "—")}</dd></div>)}</dl>
      <div className="mt-7 border-t border-white/10 pt-6"><h3 className="font-semibold">Admin actions</h3><p className="mt-2 text-xs leading-5 text-slate-400">Payment review and QR delivery happen in the Payment review tab. Check bank ownership before transferring a refund. Mark a refund sent only after making the bank transfer outside this site.</p><div className="mt-4 flex flex-wrap gap-2">{selected.payment_status === "verified" && selected.registration_status === "confirmed" && selected.completion_status !== "completed" && <Button size="sm" disabled={busy} onClick={() => action(selected.id, "complete")}>Mark workshop completed</Button>}</div>{selected.refund_status === "pending" && <div className="mt-5"><label className="block text-sm text-slate-300">Bank transfer reference<Input className="mt-2" value={refundReference} onChange={e => setRefundReference(e.target.value)} placeholder="Reference from completed bank transfer"/></label><Button className="mt-3" size="sm" disabled={busy || !refundReference.trim()} onClick={() => action(selected.id, "mark_refunded")}>Record refund sent</Button></div>}</div>
    </div></div>}
    </div>
    </div>
  </div>;
}
