"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { rejectionReasons, type RejectionReason } from "@/lib/rejection";

type ReviewStatus = "pending_review" | "sent" | "rejected" | "failed" | "sending";
type Registration = Record<string, unknown> & {
  id: string; reference: string; full_name: string; email: string; institution: string;
  attendance: string; payment_method: string; payment_transaction_id: string;
  payment_amount_bdt: number; qr_status: ReviewStatus; rejection_email_status: string;
  created_at: string;
};
const filters: { key: ReviewStatus; label: string }[] = [
  { key: "pending_review", label: "Awaiting review" },
  { key: "sent", label: "QR sent" },
  { key: "rejected", label: "Rejected" },
  { key: "failed", label: "Delivery failed" },
  { key: "sending", label: "Sending" }
];
const formattedDate = (value: string) => new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function RegistrationReview({ onUpdated }: { onUpdated: () => void }) {
  const [filter, setFilter] = useState<ReviewStatus>("pending_review");
  const [rows, setRows] = useState<Registration[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [reason, setReason] = useState<RejectionReason>("transaction_mismatch");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/participants?${new URLSearchParams({ qr_status: filter, page: String(page) })}`, { cache: "no-store" });
    if (!response.ok) { setMessage("Unable to load registrations."); return; }
    const result = await response.json();
    setRows(result.participants); setCount(result.count);
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: "send_qr" | "reject" | "retry_rejection_email") {
    if (!selected || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, action, reason, detail }) });
      const result = await response.json();
      if (response.ok) {
        setMessage(action === "send_qr" ? "QR ticket sent after payment review." : action === "reject" ?
          result.emailSent ? "Registration cancelled and the participant was emailed." : "Registration cancelled. The email failed; retry it from Rejected." : "Cancellation email sent.");
        setSelected(null); setDetail("");
        await load(); onUpdated();
      } else {
        setMessage(result.error || (action === "send_qr" ? "QR delivery failed. Check Delivery failed for retry." : "Action could not be completed."));
        setSelected(null);
        await load(); onUpdated();
      }
    } catch { setMessage("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  return <section>
    <div className="mb-5"><h2 className="text-2xl font-semibold">Payment review and QR delivery</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Match the submitted transaction ID against the selected payment account yourself. Send the QR only when it matches; otherwise choose a cancellation reason.</p></div>
    <div className="mb-5 flex flex-wrap gap-2">{filters.map(item => <button key={item.key} onClick={() => { setFilter(item.key); setPage(0); setSelected(null); setMessage(""); }}
      className={`rounded-xl px-4 py-2.5 text-sm ${filter === item.key ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/8"}`}>{item.label}</button>)}</div>
    {message && <p role="status" className="mb-5 rounded-xl border border-cyan-400/20 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    <div className="panel overflow-x-auto rounded-2xl"><table className="w-full min-w-[880px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-400 uppercase"><tr>{["Participant", "Payment", "Transaction ID", "Amount", "QR status", "Registered", ""].map(h => <th key={h} className="px-4 py-4 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b border-white/8 last:border-0"><td className="px-4 py-4"><strong className="block text-white">{row.full_name}</strong><span className="text-xs text-slate-400">{row.reference}</span></td><td className="px-4 py-4 capitalize">{row.payment_method}</td><td className="px-4 py-4 font-mono text-cyan-200">{row.payment_transaction_id}</td><td className="px-4 py-4">৳{row.payment_amount_bdt?.toLocaleString("en-US")}</td><td className="px-4 py-4">{row.qr_status.replaceAll("_", " ")}</td><td className="px-4 py-4 whitespace-nowrap">{formattedDate(row.created_at)}</td><td className="px-4 py-4"><button className="text-cyan-300 hover:underline" onClick={() => { setSelected(row); setReason("transaction_mismatch"); setDetail(""); }}>Review</button></td></tr>)}</tbody></table>
      {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No registrations in this category.</p>}</div>
    <div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>{count} total · Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}>Next</Button></div>
    {selected && <div role="dialog" aria-modal="true" aria-label="Review registration" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelected(null)}><div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 md:p-8" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">{selected.full_name}</h3><p className="mt-1 text-sm text-slate-400">{selected.email} · {selected.reference}</p></div><button aria-label="Close review" onClick={() => setSelected(null)} className="text-slate-300">Close</button></div>
      <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm"><p><strong>Payment method:</strong> {selected.payment_method}</p><p className="mt-1"><strong>Transaction ID:</strong> <span className="font-mono text-cyan-200">{selected.payment_transaction_id}</span></p><p className="mt-1"><strong>Amount:</strong> ৳{selected.payment_amount_bdt?.toLocaleString("en-US")}</p><p className="mt-1"><strong>Destination:</strong> {String(selected.payment_destination || "—")}</p></div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{[["Institution", selected.institution], ["Department", selected.department], ["Academic year", selected.academic_year], ["Student ID", selected.student_id], ["Programming level", selected.programming_level], ["Python familiarity", selected.python_familiarity], ["API experience", selected.api_experience], ["AI familiarity", selected.ai_familiarity], ["Agent experience", selected.agent_experience], ["Paid LLM subscription", selected.paid_llm_subscription], ["Local model laptop", selected.local_model_laptop], ["Attendance", selected.attendance], ["Registration", selected.registration_status], ["QR status", selected.qr_status], ["QR sent at", selected.qr_sent_at ? formattedDate(String(selected.qr_sent_at)) : "—"], ["Rejection reason", selected.rejection_reason_code ? rejectionReasons[selected.rejection_reason_code as RejectionReason] : "—"], ["Reason details", selected.rejection_reason_detail || "—"], ["Cancellation email", selected.rejection_email_status]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-slate-500">{String(label)}</dt><dd className="mt-1 break-words text-slate-200">{String(value || "—")}</dd></div>)}</dl>
      {(selected.qr_status === "pending_review" || selected.qr_status === "failed" || selected.qr_status === "sending") && <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm leading-6 text-slate-300">Only send after you have checked the transaction ID in the payment account. Sending records the payment as verified; the registration is confirmed when the QR email succeeds.</p><Button className="mt-4" disabled={busy} onClick={() => void act("send_qr")}>{selected.qr_status === "sending" ? "Retry after five minutes" : selected.qr_status === "failed" ? "Retry QR email" : "Verify payment & send QR"}</Button></div>}
      {selected.qr_status === "pending_review" && <div className="mt-7 border-t border-white/10 pt-5"><h4 className="font-semibold">Cancel registration</h4><p className="mt-1 text-xs text-slate-400">The selected reason will be included in a polite email to the participant.</p><label className="mt-4 block text-sm text-slate-300">Reason<Select className="mt-2" value={reason} onChange={e => setReason(e.target.value as RejectionReason)}>{Object.entries(rejectionReasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label><label className="mt-4 block text-sm text-slate-300">Additional explanation {reason === "other" ? "(required)" : "(optional)"}<Textarea className="mt-2" maxLength={500} rows={3} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Keep the message clear and respectful"/></label><Button className="mt-4" variant="danger" disabled={busy || (reason === "other" && !detail.trim())} onClick={() => void act("reject")}>Cancel and email reason</Button></div>}
      {selected.qr_status === "rejected" && Boolean(selected.rejection_reason_code) && selected.rejection_email_status !== "sent" && <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm text-slate-300">The cancellation email has not been delivered.</p><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void act("retry_rejection_email")}>Retry cancellation email</Button></div>}
    </div></div>}
  </section>;
}
