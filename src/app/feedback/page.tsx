import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardList } from "lucide-react";
import { Navigation } from "@/components/navigation";
import { feedbackSchedules } from "@/lib/feedback-server";
import { availability, formDetails, formKeys, openingDate, type FormSchedule } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feedback & Evaluation | Agentic AI Workshop" };

export default async function FeedbackIndex() {
  let forms: FormSchedule[];
  try { forms = await feedbackSchedules(); } catch { forms = []; }
  return <><Navigation registrationOpen={null}/><main className="site-container py-14 md:py-20">
    <div className="max-w-3xl"><p className="section-kicker">Workshop evaluation</p><h1 className="section-title mt-4">Feedback &amp; Evaluation</h1>
      <p className="mt-5 leading-7 text-slate-300">Share what worked and what could improve. Each workshop has a short, anonymous form with five questions. Registration is not required.</p></div>
    <div className="mt-10 grid gap-5 lg:grid-cols-2">{formKeys.map((key, index) => {
      const form = forms.find(item => item.key === key);
      const state = form ? availability(form) : "closed";
      const detail = formDetails[key];
      return <article key={key} className="panel flex h-full flex-col rounded-3xl p-6 md:p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><ClipboardList size={21}/></span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[.16em] text-cyan-300">Workshop {index + 1} feedback</p>
        <h2 className="mt-3 text-xl font-semibold leading-snug text-white">{detail.title}</h2>
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-300"><CalendarDays size={16}/>Workshop date: {detail.date}</p>
        {form && <p className="mt-2 text-sm text-slate-300">Feedback opens: {openingDate(form)}</p>}
        <p className="mt-4 text-sm leading-6 text-slate-400">{detail.focus}</p>
        <p className="mt-6 text-sm text-slate-300" role="status">{!form ? "This form is temporarily unavailable." : !form.enabled ? "Feedback is currently closed." : state === "upcoming" ? `Feedback will be available on ${openingDate(form)}.` : state === "closed" ? "Feedback collection has ended." : "Open for anonymous responses."}</p>
        <div className="mt-auto pt-7">{state === "open" ? <Link href={`/feedback/${key}`} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Give Anonymous Feedback<ArrowRight size={17}/></Link>
          : <span className="inline-flex rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-500">Unavailable</span>}</div>
      </article>;
    })}</div>
  </main></>;
}
