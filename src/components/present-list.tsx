"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Present = { source: "outsider" | "batch14"; reference: string; full_name: string; email: string; attendance: string; checked_in_at: string };
export function PresentList() {
  const [day, setDay] = useState<1 | 2>(1);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Present[]>([]);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/present?${new URLSearchParams({ day: String(day), page: String(page) })}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to load attendance."); return; }
    setRows(data.participants); setCount(data.count); setMessage("");
  }, [day, page]);
  useEffect(() => { void load(); }, [load]);
  return <section><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-semibold">Present participants</h2><p className="mt-2 text-sm text-slate-400">Everyone checked in, from Batch 14 and outside registrations, in one list.</p></div><Button variant="outline" onClick={() => void load()}>Refresh</Button></div>
    <div className="mb-5 flex gap-2">{([1, 2] as const).map(value => <button key={value} onClick={() => { setDay(value); setPage(0); }} className={`rounded-xl px-4 py-2.5 text-sm ${day === value ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300"}`}>Day {value}</button>)}</div>
    {message && <p role="alert" className="mb-5 text-sm text-red-300">{message}</p>}
    <div className="panel overflow-x-auto rounded-2xl"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-400 uppercase"><tr>{["Name", "Group", "Reference", "Email", "Checked in"].map(label => <th key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.reference} className="border-b border-white/8 last:border-0"><td className="px-4 py-4 font-medium text-white">{row.full_name}</td><td className="px-4 py-4">{row.source === "batch14" ? "Batch 14" : "Outside"}</td><td className="px-4 py-4 font-mono text-cyan-200">{row.reference}</td><td className="px-4 py-4">{row.email}</td><td className="px-4 py-4 whitespace-nowrap">{new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.checked_in_at))}</td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-sm text-slate-400">No one checked in on Day {day} yet.</p>}</div>
    <div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>{count} present · Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= count} onClick={() => setPage(page + 1)}>Next</Button></div>
  </section>;
}
