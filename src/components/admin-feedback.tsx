"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formDetails, formKeys, type FormKey, type FormSchedule } from "@/lib/feedback";

type Count = { label: string; count: number };
type Rating = { average: number | null; distribution: Count[] };
type WorkshopResults = { total: number; ratings: Record<string, Rating>; pacing: Count[];
  comments: { most_valuable: string[]; improvements: string[] } };
type Results = { background: Record<string, number | Count[]>; "workshop-1": WorkshopResults; "workshop-2": WorkshopResults };
const backgroundLabels: Record<string, string> = {
  academic_discipline: "Academic discipline", software_credits: "Software engineering credits",
  ai_use_frequency: "AI tool usage frequency", ai_tools: "AI tools used", ai_activities: "AI-assisted activities",
  ai_coursework: "AI-driven software engineering coursework", agentic_coursework: "Agentic systems coursework",
  agentic_familiarity: "Agentic AI familiarity"
};
const ratingLabels: Record<string, string> = {
  overall_quality: "Overall satisfaction (quality)", clarity: "Concept clarity", relevance: "Content relevance",
  examples: "Examples and demonstrations", confidence: "Workshop-specific confidence"
};
const toLocal = (value: string | null) => value ? new Date(new Date(value).getTime() + 6 * 3600000).toISOString().slice(0, 16) : "";
const toIso = (value: string) => value ? new Date(`${value}:00+06:00`).toISOString() : null;

function Bars({ items }: { items: Count[] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  return <div className="mt-3 space-y-2">{items.map(item => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-3 text-xs sm:grid-cols-[minmax(130px,1fr)_minmax(100px,2fr)_3rem]">
    <span className="truncate text-slate-300" title={item.label}>{item.label}</span>
    <div className="hidden h-2 overflow-hidden rounded-full bg-white/8 sm:block"><div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${item.count / max * 100}%` }}/></div>
    <strong className="text-right text-white">{item.count}</strong>
  </div>)}</div>;
}

export function AdminFeedback() {
  const [forms, setForms] = useState<FormSchedule[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/feedback", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Unable to load feedback results."); return; }
      setForms(data.forms); setResults(data.results);
    } catch { setMessage("Unable to connect to feedback results. Please try again."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const change = (key: FormKey, field: "opens_at" | "closes_at" | "enabled", value: string | boolean | null) =>
    setForms(current => current.map(form => form.key === key ? { ...form, [field]: value } : form));
  async function save(form: FormSchedule) {
    setBusy(form.key); setMessage("");
    try {
      const response = await fetch("/api/admin/feedback", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form) });
      const data = await response.json();
      setMessage(response.ok ? "Feedback schedule saved." : data.error || "Unable to save schedule.");
      if (response.ok) await load();
    } catch { setMessage("Unable to connect. Please try again."); }
    finally { setBusy(null); }
  }
  return <div className="space-y-6">
    {message && <p role="status" className="rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    <section className="panel rounded-2xl p-5 md:p-7"><h3 className="text-xl font-semibold">Form availability</h3><p className="mt-2 text-sm text-slate-400">Times use Bangladesh time (UTC+6). Workshop feedback cannot open before its workshop date.</p>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">{formKeys.map(key => {
        const form = forms.find(item => item.key === key);
        if (!form) return <p key={key} className="text-sm text-slate-500">{formDetails[key].title}: not configured</p>;
        return <div key={key} className="rounded-xl border border-white/10 bg-white/3 p-4"><h4 className="font-semibold leading-6">{formDetails[key].title}</h4>
          <label className="mt-4 block text-sm text-slate-300">Opens<input type="datetime-local" value={toLocal(form.opens_at)} onChange={event => change(key, "opens_at", event.target.value ? toIso(event.target.value)! : form.opens_at)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-950/50 p-2 text-white"/></label>
          <label className="mt-3 block text-sm text-slate-300">Closes (optional)<input type="datetime-local" value={toLocal(form.closes_at)} onChange={event => change(key, "closes_at", event.target.value ? toIso(event.target.value)! : null)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-950/50 p-2 text-white"/></label>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={form.enabled} onChange={event => change(key, "enabled", event.target.checked)} className="accent-cyan-400"/>Accept responses</label>
          <Button type="button" size="sm" className="mt-4" disabled={Boolean(busy)} onClick={() => void save(form)}>{busy === key ? "Saving..." : "Save schedule"}</Button>
        </div>;
      })}</div>
    </section>
    {results && <>
      <section className="panel rounded-2xl p-5 md:p-7"><h3 className="text-xl font-semibold">Pre-Workshop Background Survey</h3><p className="mt-2 text-sm text-cyan-200">{Number(results.background.total)} anonymous responses</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{Object.entries(backgroundLabels).map(([key, label]) => <div key={key} className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold">{label}</h4><Bars items={results.background[key] as Count[]}/></div>)}</div>
      </section>
      <section className="panel rounded-2xl p-5 md:p-7"><h3 className="text-xl font-semibold">Workshop comparison</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b border-white/15 text-slate-400"><th className="py-3">Metric</th><th>Workshop 1</th><th>Workshop 2</th></tr></thead><tbody>
        <tr className="border-b border-white/10"><th className="py-3 font-medium">Responses</th><td>{results["workshop-1"].total}</td><td>{results["workshop-2"].total}</td></tr>
        {Object.entries(ratingLabels).map(([key, label]) => <tr key={key} className="border-b border-white/10"><th className="py-3 font-medium">{label}</th><td>{results["workshop-1"].ratings[key].average ?? "—"} / 5</td><td>{results["workshop-2"].ratings[key].average ?? "—"} / 5</td></tr>)}
      </tbody></table></div></section>
      {(["workshop-1", "workshop-2"] as const).map(key => <section key={key} className="panel rounded-2xl p-5 md:p-7"><h3 className="text-xl font-semibold">{formDetails[key].title}</h3><p className="mt-2 text-sm text-cyan-200">{results[key].total} anonymous responses</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{Object.entries(ratingLabels).map(([field, label]) => <div key={field} className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold">{label} <span className="text-cyan-300">{results[key].ratings[field].average ?? "—"} / 5</span></h4><Bars items={results[key].ratings[field].distribution}/></div>)}
          <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold">Pacing</h4><Bars items={results[key].pacing}/></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">{([ ["most_valuable", "Most valuable aspects"], ["improvements", "Suggestions for improvement"] ] as const).map(([field, label]) => <div key={field} className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold">{label}</h4>{results[key].comments[field].length ? <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm text-slate-300">{results[key].comments[field].map((comment, index) => <li key={index} className="rounded-lg bg-white/5 p-3 whitespace-pre-wrap break-words">{comment}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No written responses yet.</p>}</div>)}</div>
      </section>)}
    </>}
  </div>;
}
