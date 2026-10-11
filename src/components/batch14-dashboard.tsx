"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Batch14Registration = {
  id: string; source_row: number; reference: string; full_name: string; email: string; phone: string | null;
  institution: string; attendance: string; payment_method: string | null; payment_transaction_id: string | null;
  payment_status: string; qr_status: string; qr_sent_at: string | null; created_at: string;
  bank_name: string | null; bank_branch: string | null; bank_account_number: string | null;
  source_data: Record<string, string>;
};
const filters = [
  ["pending_review", "Awaiting review"], ["sent", "QR sent"], ["failed", "Delivery failed"], ["sending", "Sending"]
] as const;

export function Batch14Dashboard({ onUpdated }: { onUpdated: () => void }) {
  const [filter, setFilter] = useState<string>("pending_review");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Batch14Registration[]>([]);
  const [count, setCount] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [selected, setSelected] = useState<Batch14Registration | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/batch14?${new URLSearchParams({ status: filter, page: String(page) })}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to load Batch 14 registrations."); return; }
    setRows(data.registrations); setCount(data.count); setConfigured(data.configured);
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);
  async function act(action: "sync" | "send_qr") {
    if (busy || (action === "send_qr" && !selected)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/batch14", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: selected?.id }) });
      const data = await response.json();
      setMessage(response.ok ? action === "sync" ?
        `Read ${data.read} responses. Imported ${data.added} new Batch 14 registrations; skipped ${data.skipped} already registered.` :
        "QR ticket sent to the Batch 14 participant." : data.error || "Action failed.");
      if (action === "send_qr") setSelected(null);
      await load(); onUpdated();
    } catch { setMessage("Network error. Try again."); }
    finally { setBusy(false); }
  }
  return <section>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Batch 14 registrations</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Sync the private Google Form response sheet at any time, including after website registration closes at 45 combined registrations. Existing rows are skipped on repeat sync. Check the payment transaction yourself before sending each QR ticket.</p></div>
      <Button disabled={busy || !configured} onClick={() => void act("sync")}>Sync Google Sheet</Button></div>
    {!configured && <p className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Google Sheets is not connected yet. Add the service account email and private key to the server environment, then share the response sheet with that email.</p>}
    <div className="mb-5 flex flex-wrap gap-2">{filters.map(([key, label]) => <button key={key} onClick={() => { setFilter(key); setPage(0); setSelected(null); }}
      className={`rounded-xl px-4 py-2.5 text-sm ${filter === key ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/8"}`}>{label}</button>)}</div>
    {message && <p role="status" className="mb-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    <div className="panel overflow-x-auto rounded-2xl"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-400 uppercase"><tr>{["Participant", "Payment", "Transaction ID", "QR", "Sheet row", ""].map(label => <th key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-b border-white/8 last:border-0"><td className="px-4 py-4"><strong className="block text-white">{row.full_name}</strong><span className="text-xs text-slate-400">{row.email}</span></td><td className="px-4 py-4 capitalize">{row.payment_method || "—"}</td><td className="px-4 py-4 font-mono text-cyan-200">{row.payment_transaction_id || "—"}</td><td className="px-4 py-4 capitalize">{row.qr_status.replaceAll("_", " ")}</td><td className="px-4 py-4">{row.source_row}</td><td className="px-4 py-4"><button className="text-cyan-300 hover:underline" onClick={() => setSelected(row)}>View</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="p-8 text-center text-sm text-slate-400">No Batch 14 registrations in this category.</p>}</div>
    <div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>{count} total · Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}>Next</Button></div>
    {selected && <div role="dialog" aria-modal="true" aria-label="Batch 14 registration" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelected(null)}><div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 md:p-8" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{selected.full_name}</h3><p className="mt-1 text-sm text-slate-400">{selected.email} · {selected.reference}</p></div><button onClick={() => setSelected(null)}>Close</button></div>
      <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm"><p><strong>Payment method:</strong> {selected.payment_method || "Missing"}</p><p className="mt-1"><strong>Transaction ID:</strong> <span className="font-mono text-cyan-200">{selected.payment_transaction_id || "Missing"}</span></p><p className="mt-1"><strong>Payment review:</strong> {selected.payment_status}</p><p className="mt-1"><strong>Bank:</strong> {selected.bank_name || "—"} · {selected.bank_branch || "—"}</p><p className="mt-1"><strong>Account:</strong> {selected.bank_account_number || "—"}</p></div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{[["Phone", selected.phone], ["Institution", selected.institution], ["Attendance", selected.attendance], ["Google Sheet row", selected.source_row], ["QR status", selected.qr_status], ["QR sent", selected.qr_sent_at]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-200">{String(value || "—")}</dd></div>)}</dl>
      <details className="mt-5 border-t border-white/10 pt-5"><summary className="cursor-pointer text-sm text-cyan-300">All Google Form answers</summary><dl className="mt-4 space-y-3">{Object.entries(selected.source_data || {}).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-200">{value || "—"}</dd></div>)}</dl></details>
      {selected.qr_status !== "sent" && <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm leading-6 text-slate-300">Confirm this transaction in the payment account before sending. The QR only records workshop attendance.</p><Button className="mt-4" disabled={busy || !selected.payment_method || !selected.payment_transaction_id} onClick={() => void act("send_qr")}>{selected.qr_status === "failed" ? "Retry QR email" : "Verify payment & send QR"}</Button></div>}
    </div></div>}
  </section>;
}
