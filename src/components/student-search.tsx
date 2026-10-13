"use client";
import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { StudentSearchResult } from "@/lib/student-search";

export function StudentSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) { setError("Enter at least 2 characters."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResults(data.results); setCount(data.count);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed.");
      setResults([]); setCount(null);
    } finally { setLoading(false); }
  }

  return <section className="space-y-5">
    <div><h2 className="text-2xl font-semibold">Search students</h2><p className="mt-2 text-sm text-slate-400">Find outside and Batch 14 registrations by name, transaction ID, contact number, or email.</p></div>
    <form onSubmit={search} className="flex max-w-3xl flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search size={18} className="absolute left-4 top-3.5 text-slate-400"/><Input aria-label="Search students" placeholder="Name, transaction ID, contact number, or email" className="pl-11" value={query} onChange={event => setQuery(event.target.value)}/></label><Button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</Button></form>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {count !== null && <p role="status" className="text-sm text-slate-400">{count} {count === 1 ? "registration" : "registrations"} found{count > 50 ? " · showing the latest 50" : ""}.</p>}
    {results.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{results.map(row => <article key={`${row.source}-${row.id}`} className="panel rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-semibold text-white">{row.full_name}</h3><p className="mt-1 text-xs text-slate-400">{row.reference}</p></div><span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">{row.source === "batch14" ? "Batch 14" : "Outside"}</span></div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{[["Email", row.email], ["Contact number", row.phone], ["Transaction ID", row.payment_transaction_id], ["Payment", row.payment_status], ["QR", row.qr_status?.replaceAll("_", " ")], ["Registration", row.registration_status]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-all text-slate-200">{value}</dd></div>)}</dl>
    </article>)}</div>}
  </section>;
}
