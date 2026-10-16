"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  activityOptions, backgroundSchema, courseOptions, creditOptions, disciplineOptions,
  frequencyOptions, pacingOptions, privacyNotice, ratingOptions, toolOptions,
  workshopSchema, type FormKey
} from "@/lib/feedback";

type Answers = Record<string, string | number | string[]>;
const backgroundQuestions = [
  ["academic_discipline", "What is your academic discipline?", disciplineOptions],
  ["software_credits", "Approximately how many credits of software engineering-related courses have you completed during your undergraduate studies?", creditOptions],
  ["ai_use_frequency", "How frequently do you use AI-powered tools?", frequencyOptions],
  ["ai_coursework", "Have you completed any undergraduate course related to AI-driven software engineering?", courseOptions],
  ["agentic_coursework", "Have you completed any undergraduate course related to agentic AI or agentic systems?", courseOptions]
] as const;
const commonQuestions = [
  ["overall_quality", "How would you rate the overall quality of this workshop?"],
  ["clarity", "How clearly were the key concepts explained?"],
  ["relevance", "How relevant was the workshop content to your academic or professional interests?"],
  ["examples", "How effective were the practical examples and demonstrations?"]
] as const;

export function FeedbackForm({ form }: { form: FormKey }) {
  const [answers, setAnswers] = useState<Answers>(form === "pre-workshop"
    ? { academic_discipline: "", software_credits: "", ai_use_frequency: "", ai_tools: [], ai_activities: [], ai_coursework: "", agentic_coursework: "", agentic_familiarity: 0 }
    : { overall_quality: 0, clarity: 0, relevance: 0, examples: 0, confidence: 0, pacing: "", most_valuable: "", improvements: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const set = (key: string, value: string | number | string[]) => {
    setAnswers(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: "" }));
  };
  const choiceGroup = (key: string, title: string, options: readonly string[] | readonly number[], multiple = false, none?: string, hint?: string) =>
    <fieldset key={key} className="rounded-2xl border border-white/10 bg-white/3 p-5 md:p-6">
      <legend className="px-1 text-base font-semibold leading-6 text-white">{title} <span className="text-cyan-300">*</span></legend>
      {hint && <p className="mt-2 text-sm text-slate-400">{hint}</p>}
      <div className={`mt-4 grid gap-2 ${typeof options[0] === "number" ? "grid-cols-5" : "sm:grid-cols-2"}`}>
        {options.map(option => {
          const value = String(option);
          const current = answers[key];
          const selected = multiple ? Array.isArray(current) && current.includes(value) : String(current) === value;
          return <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition ${selected ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-white/10 bg-slate-950/20 text-slate-300 hover:border-white/25"}`}>
            <input type={multiple ? "checkbox" : "radio"} name={key} value={value} checked={selected}
              onChange={() => {
                if (!multiple) set(key, typeof option === "number" ? option : value);
                else {
                  const items = Array.isArray(current) ? current : [];
                  set(key, selected ? items.filter(item => item !== value) : value === none ? [value] : [...items.filter(item => item !== none), value]);
                }
              }} className="mt-0.5 accent-cyan-400"/>
            <span>{value}</span>
          </label>;
        })}
      </div>
      {errors[key] && <p role="alert" className="mt-3 text-sm text-rose-300">{errors[key]}</p>}
    </fieldset>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = (form === "pre-workshop" ? backgroundSchema : workshopSchema).safeParse(answers);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "");
        const value = answers[key];
        if (key && !fieldErrors[key]) fieldErrors[key] = value === "" || value === 0 || (Array.isArray(value) && value.length === 0)
          ? "Please choose an answer." : issue.message;
      }
      setErrors(fieldErrors);
      setMessage("Please check the highlighted answers.");
      return;
    }
    inFlight.current = true; setSaving(true); setMessage(""); setErrors({});
    try {
      const response = await fetch(`/api/feedback/${form}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "We could not save your response. Please try again."); return; }
      setSaved(true);
    } catch { setMessage("We could not connect. Please try again."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  if (saved) return <div role="status" className="panel mt-8 rounded-2xl border-cyan-400/30 p-8 text-center"><h2 className="text-2xl font-semibold text-white">Thank you for your anonymous response.</h2><p className="mt-3 text-slate-300">Your answers were saved without registration or contact details.</p></div>;
  return <form onSubmit={submit} noValidate className="mt-8 space-y-5">
    <p className="rounded-2xl border border-cyan-400/25 bg-cyan-400/7 p-5 text-sm leading-6 text-cyan-100">{privacyNotice}</p>
    {form === "pre-workshop" ? <>
      {backgroundQuestions.slice(0, 3).map(([key, title, options]) => choiceGroup(key, title, options))}
      {choiceGroup("ai_tools", "Which AI tools have you used?", toolOptions, true, "I have not used any AI tools", "Select all that apply.")}
      {choiceGroup("ai_activities", "For which activities have you used AI tools?", activityOptions, true, "I have not used AI tools", "Select all that apply.")}
      {backgroundQuestions.slice(3).map(([key, title, options]) => choiceGroup(key, title, options))}
      {choiceGroup("agentic_familiarity", "How would you rate your current familiarity with agentic AI systems?", ratingOptions, false, undefined, "1 = Not familiar at all · 2 = Slightly familiar · 3 = Moderately familiar · 4 = Familiar · 5 = Very familiar")}
    </> : <>
      <p className="text-sm text-slate-400">For ratings, 1 means very poor or not confident at all; 5 means excellent or very confident.</p>
      {commonQuestions.map(([key, title]) => choiceGroup(key, title, ratingOptions))}
      {choiceGroup("confidence", form === "workshop-1" ? "How confident do you feel about understanding agentic software architecture after attending this workshop?" : "How confident do you feel about building, evaluating, and showcasing an agentic AI system after attending this workshop?", ratingOptions)}
      {choiceGroup("pacing", "Was the pacing of the workshop appropriate?", pacingOptions)}
      {([ ["most_valuable", "What was the most valuable aspect of the workshop?"], ["improvements", "What improvements would you suggest for future workshops?"] ] as const).map(([key, title]) => <div key={key} className="rounded-2xl border border-white/10 bg-white/3 p-5 md:p-6"><label htmlFor={key} className="block font-semibold text-white">{title} <span className="font-normal text-slate-400">(optional)</span></label><textarea id={key} value={String(answers[key])} onChange={event => set(key, event.target.value)} maxLength={1000} rows={4} className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950/40 p-3 text-sm text-white outline-none focus:border-cyan-400" placeholder="Please avoid names, contact details, and links."/>{errors[key] && <p role="alert" className="mt-2 text-sm text-rose-300">{errors[key]}</p>}</div>)}
    </>}
    {message && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{message}</p>}
    <Button type="submit" disabled={saving} size="lg">{saving ? "Submitting..." : "Submit anonymously"}</Button>
  </form>;
}
