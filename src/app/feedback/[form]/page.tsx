import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "@/components/navigation";
import { FeedbackForm } from "@/components/feedback-form";
import { feedbackSchedules } from "@/lib/feedback-server";
import { availability, formDetails, formKeys, openingDate, type FormKey } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export default async function FeedbackFormPage({ params }: { params: Promise<{ form: string }> }) {
  const { form: value } = await params;
  if (!formKeys.includes(value as FormKey)) notFound();
  const key = value as FormKey;
  let form;
  try { form = (await feedbackSchedules()).find(item => item.key === key); } catch { /* Show setup state. */ }
  const state = form ? availability(form) : "closed";
  return <><Navigation registrationOpen={null}/><main className="site-container py-12 md:py-18">
    <Link href="/feedback" className="text-sm text-cyan-300 hover:underline">← All feedback forms</Link>
    <div className="mx-auto mt-8 max-w-3xl"><p className="section-kicker">Workshop date: {formDetails[key].date}</p><h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">{formDetails[key].title}</h1>
      {form && <p className="mt-4 text-sm text-slate-300">Feedback opens: {openingDate(form)}</p>}
      {state === "open" && form ? <FeedbackForm form={key}/> : <div className="panel mt-8 rounded-2xl p-6 text-slate-200" role="status">{!form ? "This form is temporarily unavailable." : !form.enabled ? "Feedback is currently closed." : state === "upcoming" ? `Feedback will be available on ${openingDate(form)}.` : "Feedback collection has ended."}</div>}</div>
  </main></>;
}
