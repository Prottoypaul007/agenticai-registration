"use client";
import { useCallback, useEffect, useState } from "react";
import { formDetails, formKeys, type FormKey } from "@/lib/feedback";

type Count = { label: string; count: number };
type WorkshopResults = {
  total: number;
  helpfulness: Count[];
  specificAnswers: number;
  confidence: Count[];
  focusAreas: Count[];
  futureWorkshops: Count[];
  improvements: string[];
  course: { support: Count[]; supportPercent: number; academicYears: Count[]; suggestions: string[] };
};
type Results = Record<FormKey, WorkshopResults> & { historical: Record<FormKey, number> };

function Bars({ items }: { items: Count[] }) {
  const max = Math.max(1, ...items.map(item => item.count));
  return <div className="mt-4 space-y-3">{items.map(item => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_minmax(70px,1fr)_2rem] items-center gap-3 text-sm">
    <span className="text-slate-300">{item.label}</span>
    <div className="h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${item.count / max * 100}%` }}/></div>
    <strong className="text-right text-white">{item.count}</strong>
  </div>)}</div>;
}
function Comments({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold text-white">{title}</h4>
    {items.length ? <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm text-slate-300">{items.map((comment, index) => <li key={index} className="whitespace-pre-wrap break-words rounded-lg bg-white/5 p-3">{comment}</li>)}</ul>
      : <p className="mt-3 text-sm text-slate-500">No written suggestions yet.</p>}
  </div>;
}

export function AdminFeedback() {
  const [results, setResults] = useState<Results | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/feedback", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Unable to load feedback results."); return; }
      setResults(data.results);
    } catch { setMessage("Unable to connect to feedback results. Please try again."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-6">
    {message && <p role="status" className="rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    {results && <>
      <section className="panel rounded-2xl p-5 md:p-7"><h3 className="text-xl font-semibold">Workshop feedback overview</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Workshop 1 asks about foundational and architectural understanding. Workshop 2 asks about practical building, evaluation, and showcasing. Their helpfulness answers measure different learning goals.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{formKeys.map((key, index) => <div key={key} className="rounded-xl border border-white/10 bg-white/3 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Workshop {index + 1}</p><p className="mt-2 text-3xl font-semibold text-white">{results[key].total}</p><p className="text-sm text-slate-400">new questionnaire responses</p></div>)}</div>
      </section>
      {formKeys.map((key, index) => {
        const result = results[key];
        return <section key={key} className="panel rounded-2xl p-5 md:p-7">
          <p className="section-kicker">Workshop {index + 1} analysis</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{formDetails[key].title}</h3>
          <p className="mt-2 text-sm text-slate-400">{formDetails[key].focus}</p>
          {result.specificAnswers < result.total && <p className="mt-2 text-xs text-slate-500">The two new day-specific questions have {result.specificAnswers} answers. Earlier responses remain in the other totals.</p>}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold text-white">{index === 0 ? "Helpfulness for fundamentals and architecture" : "Helpfulness for building, evaluation, and showcasing"}</h4><Bars items={result.helpfulness}/></div>
            <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold text-white">{index === 0 ? "Confidence in sketching an agentic architecture" : "Confidence in building and evaluating an agent"}</h4><Bars items={result.confidence}/></div>
            <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold text-white">{index === 0 ? "Topics needing more explanation" : "Hands-on steps needing more practice"}</h4><Bars items={result.focusAreas}/></div>
            <div className="rounded-xl border border-white/10 p-4"><h4 className="font-semibold text-white">Interest in future {index === 0 ? "conceptual" : "hands-on"} workshops</h4><Bars items={result.futureWorkshops}/></div>
          </div>
          <div className="mt-4"><Comments title="Suggestions for workshop improvement" items={result.improvements}/></div>
          <div className="mt-7 border-t border-white/10 pt-6"><h4 className="text-lg font-semibold text-white">Undergraduate course analysis</h4>
            <p className="mt-2 text-sm text-slate-400"><strong className="text-2xl text-cyan-300">{result.course.supportPercent}%</strong> support introducing the course ({result.course.support.find(item => item.label === "Yes")?.count ?? 0} of {result.total} responses).</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-white/10 p-4"><h5 className="font-semibold">Course support</h5><Bars items={result.course.support}/></div><div className="rounded-xl border border-white/10 p-4"><h5 className="font-semibold">Preferred academic year</h5><p className="mt-1 text-xs text-slate-400">Among respondents who selected Yes.</p><Bars items={result.course.academicYears}/></div></div>
            <div className="mt-4"><Comments title="Suggested course topics and activities" items={result.course.suggestions}/></div>
          </div>
        </section>;
      })}
      {(results.historical["workshop-1"] > 0 || results.historical["workshop-2"] > 0) && <p className="text-xs leading-5 text-slate-500">Earlier questionnaire responses remain stored separately: Workshop 1: {results.historical["workshop-1"]}; Workshop 2: {results.historical["workshop-2"]}. They are excluded from these new question totals.</p>}
    </>}
  </div>;
}
