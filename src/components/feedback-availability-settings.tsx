"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { availability, formDetails, formKeys, openingDate, type FormKey, type FormSchedule } from "@/lib/feedback";

const toLocal = (value: string | null) => value ? new Date(new Date(value).getTime() + 6 * 3600000).toISOString().slice(0, 16) : "";
const toIso = (value: string) => new Date(`${value}:00+06:00`).toISOString();

export function FeedbackAvailabilitySettings() {
  const [forms, setForms] = useState<FormSchedule[]>([]);
  const [savedForms, setSavedForms] = useState<FormSchedule[]>([]);
  const [busy, setBusy] = useState<FormKey | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/feedback?view=schedules", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load feedback settings.");
    setForms(data.forms); setSavedForms(data.forms);
  }, []);
  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Unable to load feedback settings.")); }, [load]);
  const change = (key: FormKey, field: "opens_at" | "closes_at" | "enabled", value: string | boolean | null) =>
    setForms(current => current.map(form => form.key === key ? { ...form, [field]: value } : form));
  async function save(form: FormSchedule) {
    setBusy(form.key); setMessage("");
    try {
      const response = await fetch("/api/admin/feedback", { method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save feedback settings.");
      await load();
      setMessage(`${formDetails[form.key].title} settings saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save feedback settings.");
    } finally { setBusy(null); }
  }
  return <section className="panel mt-5 rounded-2xl p-6 md:p-8" aria-labelledby="feedback-availability-heading">
    <p className="section-kicker">Survey and evaluation</p>
    <h2 id="feedback-availability-heading" className="mt-2 text-xl font-semibold text-white">Feedback availability</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Turn each anonymous form on or off independently. Opening and closing times use Bangladesh time (UTC+6). Workshop feedback cannot open before its workshop date.</p>
    {message && <p role="status" className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    <div className="mt-6 grid gap-4 md:grid-cols-2">{formKeys.map(key => {
      const form = forms.find(item => item.key === key);
      const saved = savedForms.find(item => item.key === key);
      if (!form || !saved) return <p key={key} className="rounded-xl border border-white/10 p-4 text-sm text-slate-400">{formDetails[key].title}: loading…</p>;
      const state = availability(saved);
      const status = !saved.enabled ? "Off" : state === "open" ? "Open now" : state === "upcoming" ? `Scheduled for ${openingDate(saved)}` : "Closed by schedule";
      const dirty = form.enabled !== saved.enabled || form.opens_at !== saved.opens_at || form.closes_at !== saved.closes_at;
      return <div key={key} className="rounded-2xl border border-white/10 bg-white/3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{key === "pre-workshop" ? "Background survey" : key === "workshop-1" ? "Workshop 1" : "Workshop 2"}</p><h3 className="mt-2 font-semibold leading-6 text-white">{formDetails[key].title}</h3></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${state === "open" ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-200" : "border-amber-400/35 bg-amber-400/10 text-amber-200"}`}>{status}</span></div>
        <fieldset className="mt-5 grid gap-2 sm:grid-cols-2" disabled={Boolean(busy)}><legend className="sr-only">{formDetails[key].title} availability</legend>
          <label className={`cursor-pointer rounded-xl border p-3 text-sm ${form.enabled ? "border-cyan-400/55 bg-cyan-400/10" : "border-white/10"}`}><input type="radio" name={`${key}-enabled`} checked={form.enabled} onChange={() => change(key, "enabled", true)} className="accent-cyan-400"/><span className="ml-2 font-medium">On</span><span className="mt-1 block text-xs text-slate-400">Accept responses within the scheduled window.</span></label>
          <label className={`cursor-pointer rounded-xl border p-3 text-sm ${!form.enabled ? "border-amber-400/55 bg-amber-400/10" : "border-white/10"}`}><input type="radio" name={`${key}-enabled`} checked={!form.enabled} onChange={() => change(key, "enabled", false)} className="accent-amber-400"/><span className="ml-2 font-medium">Off</span><span className="mt-1 block text-xs text-slate-400">Stop new responses immediately.</span></label>
        </fieldset>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block text-sm text-slate-300">Opens<input type="datetime-local" value={toLocal(form.opens_at)} disabled={Boolean(busy)} onChange={event => { if (event.target.value) change(key, "opens_at", toIso(event.target.value)); }} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-950/50 p-2 text-white"/></label>
          <label className="block text-sm text-slate-300">Closes (optional)<input type="datetime-local" value={toLocal(form.closes_at)} disabled={Boolean(busy)} onChange={event => change(key, "closes_at", event.target.value ? toIso(event.target.value) : null)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-950/50 p-2 text-white"/></label></div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" size="sm" disabled={Boolean(busy) || !dirty} onClick={() => void save(form)}>{busy === key ? "Saving..." : "Save feedback settings"}</Button>{dirty && <span className="text-xs text-amber-200">Unsaved change</span>}</div>
      </div>;
    })}</div>
  </section>;
}
