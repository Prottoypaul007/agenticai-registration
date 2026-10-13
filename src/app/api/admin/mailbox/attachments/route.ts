import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { MAILBOX_ATTACHMENT_BUCKET, attachmentType, validateAttachment, type MailboxAttachment } from "@/lib/mailbox-attachments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.messageId !== "string" || !uuid.test(body.messageId))
    return NextResponse.json({ error: "Save the draft before attaching files." }, { status: 400 });
  const client = serviceClient();
  const { data: message, error: messageError } = await client.from("mailbox_messages")
    .select("id,status,attachments,attachment_expires_at").eq("id", body.messageId).maybeSingle();
  if (messageError) return NextResponse.json({ error: "Attachment storage is unavailable. Apply migration 016." }, { status: 503 });
  if (!message || message.status !== "draft") return NextResponse.json({ error: "Attachments can only be changed before sending." }, { status: 409 });
  const attachments = (message.attachments || []) as MailboxAttachment[];
  const storage = client.storage.from(MAILBOX_ATTACHMENT_BUCKET);
  try {
    if (body.action === "prepare") {
      if (typeof body.name !== "string" || typeof body.size !== "number")
        return NextResponse.json({ error: "Invalid file." }, { status: 400 });
      const issue = validateAttachment(body.name, body.size, attachments);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      const id = randomUUID();
      const path = `${body.messageId}/${id}`;
      const mime = attachmentType(body.name)!;
      const { data: signed, error: signError } = await storage.createSignedUploadUrl(path);
      if (signError || !signed) throw new Error("Unable to prepare a private upload. Check migration 016.");
      const file: MailboxAttachment = { id, name: body.name, size: body.size, mime, path, status: "reserved" };
      const { data, error } = await client.from("mailbox_messages").update({
        attachments: [...attachments, file], attachment_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        attachments_cleaned_at: null, updated_at: new Date().toISOString()
      }).eq("id", body.messageId).eq("status", "draft").select("id").maybeSingle();
      if (error || !data) throw new Error("Unable to record the temporary attachment.");
      return NextResponse.json({ file, path, token: signed.token });
    }
    if (body.action === "complete") {
      const file = attachments.find(item => item.id === body.attachmentId);
      if (!file?.path || file.status !== "reserved") return NextResponse.json({ error: "Upload was not prepared." }, { status: 409 });
      const { data: info, error: infoError } = await storage.info(file.path);
      if (infoError || !info || info.size !== file.size)
        return NextResponse.json({ error: "Uploaded file size did not match. Remove it and upload again." }, { status: 409 });
      const updated = attachments.map(item => item.id === file.id ? { ...item, status: "ready" } : item);
      const { data, error } = await client.from("mailbox_messages").update({ attachments: updated, updated_at: new Date().toISOString() })
        .eq("id", body.messageId).eq("status", "draft").select("id").maybeSingle();
      if (error || !data) throw new Error("Unable to confirm the uploaded file.");
      return NextResponse.json({ file: { ...file, status: "ready" } });
    }
    if (body.action === "remove") {
      const file = attachments.find(item => item.id === body.attachmentId);
      if (!file) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
      if (file.path) {
        const { error: removeError } = await storage.remove([file.path]);
        if (removeError) throw new Error("Unable to remove the temporary file. Try again.");
      }
      const { data, error } = await client.from("mailbox_messages").update({
        attachments: attachments.filter(item => item.id !== file.id), updated_at: new Date().toISOString()
      }).eq("id", body.messageId).eq("status", "draft").select("id").maybeSingle();
      if (error || !data) throw new Error("Unable to remove the attachment record.");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Mailbox attachment action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attachment action failed." }, { status: 503 });
  }
}
