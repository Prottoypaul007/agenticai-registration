"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, Search } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { renderMailboxBody } from "@/lib/mailbox-content";
import { attachmentType, formatAttachmentSize, validateAttachment, type MailboxAttachment,
  MAILBOX_ATTACHMENT_BUCKET } from "@/lib/mailbox-attachments";

type Recipient = { source: "outsider" | "batch14"; reference: string; full_name: string; email: string; phone: string | null };
type Counts = { pending: number; sending: number; sent: number; failed: number; expired: number };
type Message = { id: string; subject: string; body: string; audience: "selected" | "all";
  recipient_refs: { source: Recipient["source"]; reference: string }[]; status: "draft" | "queued";
  created_at: string; updated_at: string; finalized_at: string | null; counts?: Counts; attachments: MailboxAttachment[] };
type Delivery = { id: string; full_name: string; email: string; status: "pending" | "sending" | "sent" | "failed" | "expired";
  attempts: number; sent_at: string | null; error: string | null };
const keyOf = (item: Pick<Recipient, "source" | "reference">) => `${item.source}:${item.reference}`;
const emptyCounts = { pending: 0, sending: 0, sent: 0, failed: 0, expired: 0 };
const when = (value: string | null) => value ? new Intl.DateTimeFormat("en-BD", {
  timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short"
}).format(new Date(value)) : "—";

export function AdminMailbox() {
  const [view, setView] = useState<"compose" | "drafts" | "sent" | "detail">("compose");
  const [roster, setRoster] = useState<Recipient[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<"selected" | "all">("selected");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MailboxAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [list, setList] = useState<Message[]>([]);
  const [listCount, setListCount] = useState(0);
  const [page, setPage] = useState(0);
  const [opened, setOpened] = useState<{ message: Message; deliveries: Delivery[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const api = useCallback(async (url: string, payload?: Record<string, unknown>) => {
    const response = await fetch(url, payload ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    } : { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Mailbox action failed.");
    return data;
  }, []);

  const loadRoster = useCallback(async () => {
    const data = await api("/api/admin/mailbox?view=roster");
    setRoster(data.participants);
    setRosterReady(true);
  }, [api]);
  const loadList = useCallback(async (section: "drafts" | "sent", index: number) => {
    const data = await api(`/api/admin/mailbox?status=${section === "drafts" ? "draft" : "queued"}&page=${index}`);
    setList(data.messages); setListCount(data.count);
  }, [api]);
  const loadMessage = useCallback(async (id: string) => {
    const data = await api(`/api/admin/mailbox?view=message&id=${encodeURIComponent(id)}`);
    setOpened(data);
    return data as { message: Message; deliveries: Delivery[] };
  }, [api]);

  useEffect(() => { void loadRoster().catch(cause => setError((cause as Error).message)); }, [loadRoster]);
  useEffect(() => {
    if (view === "drafts" || view === "sent")
      void loadList(view, page).catch(cause => setError((cause as Error).message));
  }, [view, page, loadList]);

  const filtered = roster.filter(item => [item.full_name, item.email, item.phone || ""]
    .some(value => value.toLocaleLowerCase().includes(filter.toLocaleLowerCase().trim())));
  const recipients = roster.filter(item => selected.has(keyOf(item)));
  const counts = opened ? opened.deliveries.reduce((result, item) => {
    result[item.status]++; return result;
  }, { ...emptyCounts }) : emptyCounts;
  const refs = [...selected].map(value => {
    const [source, reference] = value.split(":");
    return { source, reference };
  });

  function reset() {
    setDraftId(null); setSubject(""); setBody(""); setSelected(new Set()); setAudience("selected");
    setAttachments([]);
    setPreview(false); setOpened(null); setNotice(""); setError(""); setView("compose");
  }
  function changeView(next: "drafts" | "sent") {
    setView(next); setPage(0); setError(""); setNotice(""); setOpened(null);
  }
  function selectAll() {
    setSelected(new Set(roster.map(keyOf))); setAudience("all"); setPreview(false);
  }
  function toggle(item: Recipient) {
    const updated = new Set(selected);
    const key = keyOf(item);
    if (updated.has(key)) updated.delete(key); else updated.add(key);
    setSelected(updated); setAudience(roster.length > 0 && updated.size === roster.length ? "all" : "selected"); setPreview(false);
  }
  function format(mark: "**" | "*" | "- ") {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart; const end = input.selectionEnd;
    const chosen = body.slice(start, end) || (mark === "- " ? "List item" : "text");
    const replacement = mark === "- " ? chosen.split("\n").map(line => `- ${line}`).join("\n") : `${mark}${chosen}${mark}`;
    setBody(body.slice(0, start) + replacement + body.slice(end)); setPreview(false);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start, start + replacement.length); });
  }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/admin/mailbox", { action: "save", id: draftId || undefined,
        subject, message: body, audience, recipients: refs });
      setDraftId(result.id); setNotice("Draft saved. No emails have been sent.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function attachFiles(chosen: FileList | null) {
    if (!chosen?.length) return;
    setError(""); setNotice(""); setPreview(false); setUploading(true);
    let known = attachments;
    let messageId = draftId;
    try {
      for (const file of Array.from(chosen)) {
        const issue = validateAttachment(file.name, file.size, known);
        if (issue) throw new Error(`${file.name}: ${issue}`);
        const saved = await api("/api/admin/mailbox", { action: "save", id: messageId || undefined,
          subject, message: body, audience, recipients: refs });
        messageId = saved.id; setDraftId(saved.id);
        const prepared = await api("/api/admin/mailbox/attachments", {
          action: "prepare", messageId, name: file.name, size: file.size
        });
        try {
          const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
          const { error: uploadError } = await supabase.storage.from(MAILBOX_ATTACHMENT_BUCKET)
            .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: attachmentType(file.name)! });
          if (uploadError) throw uploadError;
          const done = await api("/api/admin/mailbox/attachments", {
            action: "complete", messageId, attachmentId: prepared.file.id
          });
          known = [...known, done.file]; setAttachments(known);
        } catch (cause) {
          try { await api("/api/admin/mailbox/attachments", {
            action: "remove", messageId, attachmentId: prepared.file.id
          }); } catch { /* The daily cleanup removes abandoned uploads. */ }
          throw cause;
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to attach files."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function removeAttachment(file: MailboxAttachment) {
    if (!draftId) return;
    setUploading(true); setError(""); setPreview(false);
    try {
      await api("/api/admin/mailbox/attachments", { action: "remove", messageId: draftId, attachmentId: file.id });
      setAttachments(previous => previous.filter(item => item.id !== file.id));
    } catch (cause) { setError((cause as Error).message); }
    finally { setUploading(false); }
  }
  async function openDraft(message: Message) {
    setBusy(true); setError("");
    try {
      const detail = await loadMessage(message.id);
      setDraftId(detail.message.id); setSubject(detail.message.subject); setBody(detail.message.body);
      setAudience(detail.message.audience);
      setAttachments(detail.message.attachments || []);
      setSelected(new Set(detail.message.recipient_refs.map(keyOf)));
      setPreview(false); setView("compose");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function openSent(message: Message) {
    setBusy(true); setError("");
    try { await loadMessage(message.id); setView("detail"); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function deliver(ids: string[], messageId: string) {
    let sent = 0; let failed = 0;
    for (const [index, id] of ids.entries()) {
      setProgress(`Sending ${index + 1} of ${ids.length}...`);
      try {
        const result = await api("/api/admin/mailbox", { action: "send_one", id });
        if (result.status === "sent") sent++; else failed++;
      } catch { failed++; }
    }
    setProgress("");
    setNotice(`Delivery complete: ${sent} sent, ${failed} failed or needing review.`);
    await loadMessage(messageId);
  }
  async function send() {
    if (!preview || !rosterReady || !recipients.length || uploading) return;
    if (selected.size !== recipients.length || (audience === "all" && recipients.length !== roster.length)) {
      setError("The recipient list changed. Refresh the mailbox and review the selection again."); return;
    }
    const confirmation = recipients.length === roster.length
      ? "You are about to send this email to all registered participants. Do you want to continue?"
      : "Are you sure you want to send this email to the selected participants?";
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/api/admin/mailbox", { action: "finalize", id: draftId || undefined,
        subject, message: body, audience, recipients: refs });
      const detail = await loadMessage(result.id);
      setView("detail"); setPreview(false);
      await deliver(detail.deliveries.filter(item => item.status === "pending").map(item => item.id), result.id);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); setProgress(""); }
  }
  async function sendRemaining(status: "pending" | "failed") {
    if (!opened) return;
    setBusy(true); setError(""); setNotice("");
    try { await deliver(opened.deliveries.filter(item => item.status === status).map(item => item.id), opened.message.id); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); setProgress(""); }
  }

  return <section>
    <div className="mb-6"><p className="section-kicker">Admin communication</p><h2 className="mt-2 text-2xl font-semibold">Mailbox</h2><p className="mt-2 text-sm text-slate-400">Compose a message for active outside and Batch 14 registrations. Emails are sent individually.</p></div>
    <nav aria-label="Mailbox navigation" className="mb-7 flex flex-wrap gap-2">{[
      ["compose", "Compose Email"], ["drafts", "Drafts"], ["sent", "Sent Emails"]
    ].map(([name, label]) => <button key={name} type="button" onClick={() => name === "compose" ? reset() : changeView(name as "drafts" | "sent")}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium ${view === name || (name === "sent" && view === "detail") ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300 hover:bg-white/8"}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">{error}</p>}
    {notice && <p role="status" className="mb-5 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">{notice}</p>}
    {progress && <p role="status" className="mb-5 text-sm text-cyan-200">{progress}</p>}

    {view === "compose" && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
      <div className="panel min-w-0 rounded-2xl p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Recipients <span className="text-cyan-300">({recipients.length})</span></h3><Button type="button" size="sm" variant="outline" disabled={!rosterReady} onClick={selectAll}>Select All Participants</Button></div>
        <p className="mt-2 text-sm text-slate-400">{rosterReady ? `${roster.length} active registrations available. Uncheck anyone you want to exclude.` : "Loading recipients from the Google Sheet and website..."}</p>
        <label className="relative mt-5 block"><Search size={17} className="absolute left-4 top-3.5 text-slate-400"/><Input aria-label="Search recipients" placeholder="Search name, email, or contact number" className="pl-11" value={filter} onChange={event => setFilter(event.target.value)}/></label>
        <div className="mt-4 max-h-[440px] space-y-2 overflow-y-auto pr-1">{filtered.map(item => <label key={keyOf(item)} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/3 p-3 hover:border-cyan-400/30"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-cyan-400" checked={selected.has(keyOf(item))} onChange={() => toggle(item)}/><span className="min-w-0"><span className="block font-medium text-white">{item.full_name} <span className="text-xs font-normal text-slate-400">· {item.source === "batch14" ? "Batch 14" : "Outside"}</span></span><span className="block break-all text-sm text-slate-300">{item.email}</span><span className="block text-xs text-slate-500">{item.phone || "No contact number"}</span></span></label>)}{rosterReady && !filtered.length && <p className="py-8 text-center text-sm text-slate-400">No matching participants.</p>}</div>
      </div>
      <div className="panel min-w-0 rounded-2xl p-5 md:p-7"><h3 className="text-lg font-semibold">Compose message</h3><label className="mt-5 block text-sm text-slate-300">Email subject<Input className="mt-2" maxLength={200} placeholder="Subject" value={subject} onChange={event => { setSubject(event.target.value); setPreview(false); }}/></label>
        <label className="mt-5 block text-sm text-slate-300">Email body</label><div className="mt-2 flex flex-wrap gap-2"><button type="button" aria-label="Bold selected text" title="Bold" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/10" onClick={() => format("**")}>B</button><button type="button" aria-label="Italicize selected text" title="Italic" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm italic hover:bg-white/10" onClick={() => format("*")}>I</button><button type="button" aria-label="Insert bullet list" title="Bullets" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10" onClick={() => format("- ")}>• List</button></div>
        <Textarea ref={editor} className="mt-2 min-h-64 resize-y" maxLength={20000} placeholder="Write your message here... (optional when attaching resources)" value={body} onChange={event => { setBody(event.target.value); setPreview(false); }}/>
        <p className="mt-2 text-xs text-slate-500">Blank lines create paragraphs. The formatting buttons insert bold, italic, and bullet syntax.</p>
        <div className="mt-6 border-t border-white/10 pt-5"><h4 className="text-sm font-semibold text-white">Attach Resources</h4><p className="mt-1 text-xs leading-5 text-slate-400">Up to 5 files and 10 MiB combined. PDF, Office files, images, ZIP, and text formats.</p><input ref={fileInput} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.zip,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.epub" className="mt-3 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border file:border-cyan-400/30 file:bg-cyan-400/10 file:px-3 file:py-2 file:text-cyan-200" disabled={busy || uploading} onChange={event => void attachFiles(event.target.files)}/>{uploading && <p role="status" className="mt-2 text-xs text-cyan-200">Uploading resources...</p>}{attachments.length > 0 && <ul className="mt-3 space-y-2">{attachments.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2 text-xs"><span className="min-w-0 break-all text-slate-200">{file.name} <span className="text-slate-500">· {file.mime} · {formatAttachmentSize(file.size)}{file.status === "removed" ? " · expired" : ""}</span></span><button type="button" className="text-rose-300 hover:underline" disabled={busy || uploading} onClick={() => void removeAttachment(file)}>Remove</button></li>)}</ul>}</div>
        <div className="mt-6 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || uploading} onClick={() => void save()}>Save Draft</Button><Button type="button" variant="outline" disabled={!rosterReady || busy || uploading || !subject.trim() || (!body.trim() && !attachments.length) || attachments.some(file => file.status !== "ready") || !recipients.length} onClick={() => setPreview(true)}>Preview Email</Button></div>
      </div>
      {preview && <div className="panel rounded-2xl border border-cyan-400/30 p-5 md:p-7 xl:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Email preview</h3><span className="text-sm text-cyan-200">{recipients.length} recipients</span></div><p className="mt-4 text-xs text-slate-500">Subject</p><p className="mt-1 font-semibold text-white">{subject}</p><div className="mt-5 rounded-xl bg-white p-5 text-slate-900">{body.trim() ? <div className="[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: renderMailboxBody(body) }}/> : <p className="text-slate-500">No message. Resources are attached below.</p>}</div><div className="mt-5"><h4 className="text-sm font-semibold">Attached resources ({attachments.length})</h4><div className="mt-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300">{attachments.length ? attachments.map(file => <p key={file.id} className="py-1">{file.name} · {formatAttachmentSize(file.size)}</p>) : <p>No files attached.</p>}</div></div><div className="mt-5"><h4 className="text-sm font-semibold">Recipients</h4><div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-white/10 p-3 text-sm text-slate-300">{recipients.map(item => <p key={keyOf(item)} className="py-1">{item.full_name} · {item.email}</p>)}</div></div><Button className="mt-5" disabled={busy || uploading} onClick={() => void send()}><Mail size={16}/> Send Email</Button></div>}
    </div>}

    {(view === "drafts" || view === "sent") && <div><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-semibold">{view === "drafts" ? "Saved drafts" : "Sent emails"} <span className="text-slate-500">({listCount})</span></h3><Button variant="outline" size="sm" disabled={busy} onClick={() => void loadList(view, page).catch(cause => setError((cause as Error).message))}>Refresh</Button></div><div className="grid gap-3">{list.map(item => { const counts = item.counts || emptyCounts; const count = counts.pending + counts.sending + counts.sent + counts.failed + counts.expired; return <button key={item.id} type="button" disabled={busy} onClick={() => void (view === "drafts" ? openDraft(item) : openSent(item))} className="panel rounded-2xl p-5 text-left transition hover:border-cyan-400/35"><div className="flex flex-wrap items-start justify-between gap-3"><strong className="text-white">{item.subject || "(No subject)"}</strong><span className="text-xs text-slate-400">{when(item.finalized_at || item.updated_at)}</span></div><p className="mt-2 truncate text-sm text-slate-400">{item.body || (item.attachments.length ? `${item.attachments.length} attached resources` : "Empty draft")}</p><p className="mt-3 text-xs text-cyan-200">{view === "drafts" ? `${item.recipient_refs.length} selected recipients` : `${count} recipients · ${counts.sent} sent · ${counts.failed} failed · ${counts.pending} pending · ${counts.sending} needs review · ${counts.expired} expired`}{item.attachments.length ? ` · ${item.attachments.length} attachments` : ""}</p></button>; })}{!list.length && <p className="panel rounded-2xl p-8 text-center text-sm text-slate-400">No {view === "drafts" ? "drafts" : "sent emails"} yet.</p>}</div><div className="mt-5 flex items-center justify-end gap-3 text-sm text-slate-400"><span>Page {page + 1} of {Math.max(1, Math.ceil(listCount / 25))}</span><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><Button size="sm" variant="outline" disabled={(page + 1) * 25 >= listCount} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button></div></div>}

    {view === "detail" && opened && <div className="panel max-w-4xl rounded-2xl p-5 md:p-8">
      <button type="button" className="text-sm text-cyan-300 hover:underline" onClick={() => changeView("sent")}>← Sent emails</button>
      <h3 className="mt-5 text-2xl font-semibold">{opened.message.subject}</h3>
      <p className="mt-2 text-sm text-slate-400">Sending started {when(opened.message.finalized_at)} · {opened.deliveries.length} recipients</p>
      <p className="mt-3 text-sm text-slate-300">{counts.sent} sent · {counts.failed} failed · {counts.pending} pending · {counts.sending} needs review · {counts.expired} expired</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {counts.pending > 0 && <Button size="sm" disabled={busy} onClick={() => void sendRemaining("pending")}>Send pending</Button>}
        {counts.failed > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void sendRemaining("failed")}>Retry failed</Button>}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void loadMessage(opened.message.id).catch(cause => setError((cause as Error).message))}>Refresh status</Button>
      </div>
      {counts.sending > 0 && <p className="mt-3 text-sm text-amber-200">Some deliveries may have reached Gmail without a saved result. Check the sender mailbox before resolving them.</p>}
      {counts.expired > 0 && <p className="mt-3 text-sm text-amber-200">Temporary resources expired before these emails were delivered. Compose a new email to resend them.</p>}
      <div className="mt-7 rounded-xl bg-white p-5 text-slate-900">{opened.message.body
        ? <div className="[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: renderMailboxBody(opened.message.body) }}/>
        : <p className="text-slate-500">No message body.</p>}</div>
      {opened.message.attachments.length > 0 && <div className="mt-7"><h4 className="font-semibold">Attached resources ({opened.message.attachments.length})</h4>
        <p className="mt-1 text-xs text-slate-400">File names and sizes are kept in history. Files are removed after delivery or expiry.</p>
        <ul className="mt-3 space-y-2">{opened.message.attachments.map(file => <li key={file.id} className="rounded-xl border border-white/10 p-3 text-sm text-slate-300">{file.name} · {formatAttachmentSize(file.size)}</li>)}</ul>
      </div>}
      <h4 className="mt-7 font-semibold">Recipients and delivery status</h4>
      <div className="mt-3 space-y-2">{opened.deliveries.map(item => <div key={item.id} className="rounded-xl border border-white/10 bg-white/3 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-white">{item.full_name} · <span className="break-all font-normal text-slate-300">{item.email}</span></span><span className={item.status === "failed" || item.status === "expired" ? "text-rose-300" : item.status === "sent" ? "text-cyan-300" : "text-amber-200"}>{item.status === "sending" ? "Needs review" : item.status}</span></div>{item.sent_at && <p className="mt-1 text-xs text-slate-500">Sent {when(item.sent_at)}</p>}{item.error && <p className="mt-1 text-xs text-rose-300">{item.error}</p>}</div>)}</div>
    </div>}
  </section>;
}
