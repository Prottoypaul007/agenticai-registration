"use client";
import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  academicYearOptions, courseSupportOptions, focusAreaOptions, futureWorkshopOptions,
  helpfulnessOptions, outcomeConfidenceOptions, privacyNotice, workshopSchemaFor, type FormKey
} from "@/lib/feedback";

type Draft = {
  learning_helpfulness: string;
  outcome_confidence: string;
  focus_area: string;
  future_workshops: string;
  improvements: string;
  course_support: string;
  academic_year: string | null;
  course_suggestions: string;
};
const initial: Draft = {
  learning_helpfulness: "", outcome_confidence: "", focus_area: "", future_workshops: "", improvements: "",
  course_support: "", academic_year: null, course_suggestions: ""
};
const questions = {
  "workshop-1": {
    helpfulness: "How helpful was this workshop in understanding the fundamentals and architecture of agentic software engineering?",
    confidence: "How confident are you in sketching an agentic system architecture after Day 1?",
    focus: "Which architecture topic would benefit most from a follow-up explanation?",
    future: "Would you like similar workshops to be organized in the future?",
    improvement: "What could be improved in future workshops on agentic software engineering fundamentals and architecture?",
    improvementHint: "Topics needing clearer explanations, more examples, session pacing, etc.",
    courseHint: "Fundamentals, agent architectures, agent workflows, software design, etc."
  },
  "workshop-2": {
    helpfulness: "How helpful was this workshop in learning to build, evaluate, and showcase agentic software systems?",
    confidence: "How confident are you in building and evaluating a small agentic application after Day 2?",
    focus: "Which hands-on step would benefit most from more practice?",
    future: "Would you like similar hands-on workshops to be organized in the future?",
    improvement: "What could be improved in future hands-on workshops on agentic software development?",
    improvementHint: "More coding time, better demonstrations, development tools, practical exercises, etc.",
    courseHint: "Hands-on projects, agent development, testing, evaluation, tool integration, deployment, etc."
  }
} as const;

export function FeedbackForm({ form }: { form: FormKey }) {
  const [answers, setAnswers] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const wording = questions[form];

  function set(key: keyof Draft, value: string | null) {
    setAnswers(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: "" }));
  }
  function radio(key: keyof Draft, title: string, options: readonly string[], number: number) {
    return <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
      <fieldset className="min-w-0" aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined}>
      <legend className="w-full font-semibold leading-6 text-white">{number}. {title} <span className="text-cyan-300">*</span></legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{options.map(option => <label key={option} className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 text-sm ${answers[key] === option ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-white/10 text-slate-300 hover:border-white/25"}`}>
        <input type="radio" name={key} value={option} checked={answers[key] === option} onChange={() => {
          set(key, option);
          if (key === "course_support" && option !== "Yes") set("academic_year", null);
        }} className="mt-0.5 accent-cyan-400"/><span>{option}</span>
      </label>)}</div>
      {errors[key] && <p id={`${key}-error`} role="alert" className="mt-2 text-sm text-rose-300">{errors[key]}</p>}
      </fieldset>
    </div>;
  }
  function textQuestion(key: "improvements" | "course_suggestions", title: string, placeholder: string, number: number) {
    return <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
      <label htmlFor={key} className="block font-semibold leading-6 text-white">{number}. {title} <span className="text-sm font-normal text-slate-400">(optional)</span></label>
      <textarea id={key} value={answers[key]} onChange={event => set(key, event.target.value)} maxLength={500} rows={3}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined}
        className="mt-3 w-full rounded-xl border border-white/15 bg-slate-950/40 p-3 text-sm text-white outline-none focus:border-cyan-400"
        placeholder={placeholder}/>
      {errors[key] && <p id={`${key}-error`} role="alert" className="mt-2 text-sm text-rose-300">{errors[key]}</p>}
    </div>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = workshopSchemaFor(form).safeParse(answers);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "");
        if (key && !nextErrors[key]) nextErrors[key] = !answers[key as keyof Draft] ? "Please choose an answer." : issue.message;
      }
      setErrors(nextErrors);
      setMessage("Please check the highlighted answers.");
      return;
    }
    requestId.current ??= crypto.randomUUID();
    inFlight.current = true; setSaving(true); setMessage(""); setErrors({});
    try {
      const response = await fetch(`/api/feedback/${form}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId.current, answers: parsed.data })
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "We could not save your response. Please try again."); return; }
      setSaved(true);
    } catch { setMessage("We could not connect. Please try again."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  if (saved) return <div role="status" className="panel mt-8 rounded-2xl border-cyan-400/30 p-8 text-center">
    <h2 className="text-2xl font-semibold text-white">Thank you for your anonymous feedback.</h2>
    <p className="mt-3 text-slate-300">Your response has been saved.</p>
  </div>;
  return <form onSubmit={submit} noValidate className="mt-8 space-y-5">
    <p className="rounded-2xl border border-cyan-400/25 bg-cyan-400/7 p-5 text-sm leading-6 text-cyan-100">{privacyNotice}</p>
    <section aria-labelledby="experience-heading" className="space-y-4">
      <div><p className="section-kicker">Section A</p><h2 id="experience-heading" className="mt-1 text-xl font-semibold">Workshop Experience &amp; Improvement</h2></div>
      {radio("learning_helpfulness", wording.helpfulness, helpfulnessOptions, 1)}
      {radio("outcome_confidence", wording.confidence, outcomeConfidenceOptions, 2)}
      {radio("focus_area", wording.focus, focusAreaOptions[form], 3)}
      {radio("future_workshops", wording.future, futureWorkshopOptions, 4)}
      {textQuestion("improvements", wording.improvement, wording.improvementHint, 5)}
    </section>
    <section aria-labelledby="course-heading" className="space-y-4 pt-3">
      <div><p className="section-kicker">Section B</p><h2 id="course-heading" className="mt-1 text-xl font-semibold">Agentic Software Engineering Course</h2></div>
      {radio("course_support", "Do you think Agentic Software Engineering should be introduced as an undergraduate course?", courseSupportOptions, 6)}
      {answers.course_support === "Yes" && <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-5">
        <fieldset className="min-w-0" aria-invalid={Boolean(errors.academic_year)}>
        <legend className="w-full font-medium text-white">If yes, in which academic year should it be offered? <span className="text-cyan-300">*</span></legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{academicYearOptions.map(year => <label key={year} className="flex cursor-pointer gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300">
          <input type="radio" name="academic_year" value={year} checked={answers.academic_year === year} onChange={() => set("academic_year", year)} className="accent-cyan-400"/>{year}
        </label>)}</div>
        {errors.academic_year && <p role="alert" className="mt-2 text-sm text-rose-300">{errors.academic_year}</p>}
        </fieldset>
      </div>}
      {textQuestion("course_suggestions", "What topics, skills, or practical activities would you suggest including in an undergraduate Agentic Software Engineering course?", wording.courseHint, 7)}
    </section>
    {message && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{message}</p>}
    <Button type="submit" disabled={saving} size="lg">{saving ? "Submitting..." : "Submit anonymously"}</Button>
  </form>;
}
