"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

function workshopDay() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const date = `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
  return date === "2026-10-17" ? 1 : date === "2026-10-18" ? 2 : 0;
}
type Result = { status: string; name: string; reference: string; attendance: string; checked_in_at: string };
export function CheckinScanner() {
  const [day, setDay] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [manual, setManual] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const locked = useRef(false);
  useEffect(() => { setDay(workshopDay()); return () => { controls.current?.stop(); }; }, []);
  async function submit(ticket: string) {
    if (locked.current) return;
    locked.current = true;
    controls.current?.stop(); controls.current = null; setScanning(false);
    setBusy(true); setResult(null); setMessage("");
    try {
      const response = await fetch("/api/admin/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, day }) });
      const data = await response.json();
      if (!response.ok) setMessage(data.error || "Check-in failed.");
      else { setResult(data); setManual(""); }
    } catch { setMessage("Network error. Check the connection and scan again."); }
    finally { setBusy(false); locked.current = false; }
  }
  async function startCamera() {
    if (!video.current || !day) return;
    setMessage(""); setResult(null);
    try {
      const reader = new BrowserQRCodeReader();
      controls.current = await reader.decodeFromVideoDevice(undefined, video.current, value => {
        if (value) void submit(value.getText());
      });
      setScanning(true);
    } catch { setMessage("Camera unavailable. Allow camera access, use HTTPS, or paste the QR content below."); }
  }
  function stopCamera() { controls.current?.stop(); controls.current = null; setScanning(false); }
  return <section className="panel max-w-3xl rounded-2xl p-5 sm:p-8">
    <h2 className="text-2xl font-semibold">Workshop check-in</h2>
    <p className="mt-2 text-sm text-slate-400">Scan each participant&apos;s emailed QR code on their workshop day. Bangladesh time determines the day automatically.</p>
    <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-4 text-sm text-cyan-100">
      {day ? `Day ${day} check-in is open (${day === 1 ? "October 17" : "October 18"}, 2026).` : "Check-in opens on October 17 and 18, 2026 (Bangladesh time)."}
    </div>
    <video ref={video} muted playsInline className={`mt-5 aspect-video w-full rounded-xl bg-black object-cover ${scanning ? "block" : "hidden"}`} />
    <div className="mt-5 flex flex-wrap gap-3">
      {!scanning ? <Button disabled={!day || busy} onClick={startCamera}>Start camera scan</Button> : <Button variant="outline" onClick={stopCamera}>Stop camera</Button>}
    </div>
    <form className="mt-7 border-t border-white/10 pt-6" onSubmit={e => { e.preventDefault(); void submit(manual.trim()); }}>
      <label htmlFor="qr-content" className="text-sm text-slate-300">QR content from a handheld scanner or copied ticket</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row"><Input id="qr-content" value={manual} onChange={e => setManual(e.target.value)} placeholder="Paste scanned QR content" autoComplete="off"/><Button type="submit" disabled={!day || busy || !manual.trim()}>Check in</Button></div>
    </form>
    {message && <p role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{message}</p>}
    {result && <div role="status" className={`mt-6 rounded-xl border p-5 ${result.status === "checked_in" ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/40 bg-amber-400/10"}`}>
      <p className="text-lg font-semibold">{result.status === "checked_in" ? "Checked in successfully" : "Already checked in today"}</p>
      <p className="mt-2">{result.name} · {result.reference}</p><p className="text-sm text-slate-300">{result.attendance} · {new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.checked_in_at))}</p>
    </div>}
  </section>;
}
