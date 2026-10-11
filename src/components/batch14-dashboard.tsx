"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Batch14Registration = {
  id: string; source_row: number; reference: string; full_name: string; email: string; phone: string | null;
  institution: string; attendance: string; payment_method: string | null; payment_transaction_id: string | null;
  payment_status: string; qr_status: string; qr_sent_at: string | null; created_at: string;
  bank_name: string | null; bank_branch: string | null; bank_account_number: string | null;
  import_issue: "duplicate_transaction" | null;
  source_data: Record<string, string>;
};
const filters = [
  ["pending_review", "Awaiting review"], ["payment_conflict", "Payment conflicts"],
  ["sent", "QR sent"], ["failed", "Delivery failed"], ["sending", "Sending"]
] as const;
const sheetTransaction = (row: Batch14Registration) => Object.entries(row.source_data || {})
  .find(([header]) => /^(payment )?transaction id$|^trx id$/i.test(header.trim()))?.[1] || "";

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
  const loadRef = useRef(load);
  const onUpdatedRef = useRef(onUpdated);
  loadRef.current = load;
  onUpdatedRef.current = onUpdated;
  useEffect(() => {
    let active = true;
    let running = false;
    async function refreshSheet() {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const response = await fetch("/api/admin/batch14", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync" }) });
        const data = await response.json();
        if (!active) return;
        if (response.ok) {
          if (data.added || data.deleted || data.moved || data.conflicts || data.resolved)
            setMessage(`Sheet updated: ${data.added || 0} new, ${data.deleted || 0} removed, ${data.moved || 0} row number(s) updated, ${data.conflicts || 0} payment conflict(s), ${data.resolved || 0} resolved.`);
          await loadRef.current();
          onUpdatedRef.current();
        } else setMessage(data.error || "Unable to sync the Google Sheet.");
      } catch { if (active) setMessage("Unable to sync the Google Sheet. Try again."); }
      finally { running = false; }
    }
    void refreshSheet();
    const timer = window.setInterval(() => { void refreshSheet(); }, 60_000);
    document.addEventListener("visibilitychange", refreshSheet);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshSheet); };
  }, []);
  async function act(action: "sync" | "send_qr") {
    if (busy || (action === "send_qr" && !selected)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/batch14", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: selected?.id }) });
      const data = await response.json();
      if (response.ok && action === "sync") {
        const details = [`Read ${data.read} responses. Imported ${data.added} new Batch 14 registrations; removed ${data.deleted || 0} no longer in the sheet; updated ${data.moved || 0} row number(s). ${data.skipped} already present.`];
        if (data.conflicts) details.push(`${data.conflicts} transaction ID conflict(s) need correction in the sheet.`);
        if (data.resolved) details.push(`${data.resolved} conflict(s) resolved.`);
        setMessage(details.join(" "));
      } else setMessage(response.ok ? "QR ticket sent to the Batch 14 participant." : data.error || "Action failed.");
      if (response.ok) setSelected(null);
      await load(); onUpdated();
    } catch { setMessage("Network error. Try again."); }
    finally { setBusy(false); }
  }
  return <section>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Batch 14 registrations</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The private Google Form sheet syncs when this tab opens and every minute while it is visible. You can also sync now. Responses removed from the sheet are removed here, including sent QR records; their QR codes stop working. Check each payment transaction before sending its QR ticket.</p></div>
      <Button disabled={busy || !configured} onClick={() => void act("sync")}>Sync Google Sheet</Button></div>
    {!configured && <p className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Google Sheets is not connected yet. Add the service account email and private key to the server environment, then share the response sheet with that email.</p>}
    <div className="mb-5 flex flex-wrap gap-2">{filters.map(([key, label]) => <button key={key} onClick={() => { setFilter(key); setPage(0); setSelected(null); }}
      className={`rounded-xl px-4 py-2.5 text-sm ${filter === key ? key === "payment_conflict" ? "bg-rose-500 text-white" : "bg-cyan-400 text-slate-950" : key === "payment_conflict" ? "border border-rose-400/50 text-rose-200 hover:bg-rose-500/10" : "border border-white/10 text-slate-300 hover:bg-white/8"}`}>{label}</button>)}</div>
    {message && <p role="status" className="mb-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">{message}</p>}
    <div className="panel overflow-x-auto rounded-2xl"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-400 uppercase"><tr>{["Participant", "Payment", "Transaction ID", "QR", "Sheet row", ""].map(label => <th key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className={`border-b border-white/8 last:border-0 ${row.import_issue ? "bg-rose-500/10" : ""}`}><td className="px-4 py-4"><strong className="block text-white">{row.full_name}</strong><span className="text-xs text-slate-400">{row.email}</span>{row.import_issue && <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-200"><AlertCircle size={13}/> Payment conflict</span>}</td><td className="px-4 py-4 capitalize">{row.payment_method || "—"}</td><td className={`px-4 py-4 font-mono ${row.import_issue ? "text-rose-200" : "text-cyan-200"}`}>{row.import_issue === "duplicate_transaction" ? <><span className="block break-all">{sheetTransaction(row) || "Duplicate ID"}</span><span className="text-xs font-semibold">Already used</span></> : row.payment_transaction_id || "—"}</td><td className="px-4 py-4 capitalize">{row.qr_status.replaceAll("_", " ")}</td><td className="px-4 py-4">{row.source_row}</td><td className="px-4 py-4"><button className="text-cyan-300 hover:underline" onClick={() => setSelected(row)}>View</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="p-8 text-center text-sm text-slate-400">No Batch 14 registrations in this category.</p>}</div>
    <div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>{count} total · Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}>Next</Button></div>
    {selected && <div role="dialog" aria-modal="true" aria-label="Batch 14 registration" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setSelected(null)}><div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6 md:p-8" onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{selected.full_name}</h3><p className="mt-1 text-sm text-slate-400">{selected.email} · {selected.reference}</p></div><button onClick={() => setSelected(null)}>Close</button></div>
      <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm"><p><strong>Payment method:</strong> {selected.payment_method || "Missing"}</p><p className="mt-1"><strong>Transaction ID:</strong> <span className="font-mono text-cyan-200">{selected.payment_transaction_id || "Missing"}</span></p><p className="mt-1"><strong>Payment review:</strong> {selected.payment_status}</p><p className="mt-1"><strong>Bank:</strong> {selected.bank_name || "—"} · {selected.bank_branch || "—"}</p><p className="mt-1"><strong>Account:</strong> {selected.bank_account_number || "—"}</p></div>
      {selected.import_issue === "duplicate_transaction" && <div role="alert" className="mt-4 rounded-xl border border-rose-400/50 bg-rose-500/15 p-4 text-sm text-rose-100"><div className="flex items-center gap-2 font-semibold"><AlertCircle size={17}/> Payment transaction conflict</div><p className="mt-2">The Google Form submitted transaction ID <strong className="break-all font-mono">{sheetTransaction(selected) || "(not available)"}</strong>, which is already used by another registration. Correct the sheet row and sync again. QR delivery stays blocked until this is resolved.</p></div>}
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{[["Phone", selected.phone], ["Institution", selected.institution], ["Attendance", selected.attendance], ["Google Sheet row", selected.source_row], ["QR status", selected.qr_status], ["QR sent", selected.qr_sent_at]].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-200">{String(value || "—")}</dd></div>)}</dl>
      <details className="mt-5 border-t border-white/10 pt-5"><summary className="cursor-pointer text-sm text-cyan-300">All Google Form answers</summary><dl className="mt-4 space-y-3">{Object.entries(selected.source_data || {}).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-200">{value || "—"}</dd></div>)}</dl></details>
      {selected.qr_status !== "sent" && <div className="mt-6 border-t border-white/10 pt-5"><p className="text-sm leading-6 text-slate-300">Confirm this transaction in the payment account before sending. The QR only records workshop attendance.</p><Button className="mt-4" disabled={busy || !!selected.import_issue || !selected.payment_method || !selected.payment_transaction_id} onClick={() => void act("send_qr")}>{selected.qr_status === "failed" ? "Retry QR email" : "Verify payment & send QR"}</Button></div>}
    </div></div>}
  </section>;
}
