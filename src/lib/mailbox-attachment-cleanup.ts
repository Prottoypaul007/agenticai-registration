import { serviceClient } from "@/lib/supabase";
import { MAILBOX_ATTACHMENT_BUCKET, type MailboxAttachment } from "@/lib/mailbox-attachments";

export async function cleanupMailboxAttachments(messageId: string) {
  const client = serviceClient();
  const { data: message, error } = await client.from("mailbox_messages")
    .select("id,status,attachments,attachment_expires_at,attachments_cleaned_at").eq("id", messageId).maybeSingle();
  if (error) throw error;
  if (!message || message.attachments_cleaned_at || !Array.isArray(message.attachments) || !message.attachments.length) return false;
  const files = message.attachments as MailboxAttachment[];
  const expiry = message.attachment_expires_at ? new Date(message.attachment_expires_at).getTime() : 0;
  const expired = expiry > 0 && Date.now() > expiry + 10 * 60 * 1000;
  if (!expired) {
    if (message.status === "draft") return false;
    const { count, error: countError } = await client.from("mailbox_deliveries")
      .select("id", { count: "exact", head: true }).eq("message_id", messageId)
      .in("status", ["pending", "failed", "sending"]);
    if (countError) throw countError;
    if (count) return false;
  } else if (message.status === "queued") {
    const { error: expiryError } = await client.from("mailbox_deliveries")
      .update({ status: "expired", error: "Temporary attachments expired before delivery." })
      .eq("message_id", messageId).in("status", ["pending", "failed"]);
    if (expiryError) throw expiryError;
  }
  const paths = files.map(file => file.path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { error: removeError } = await client.storage.from(MAILBOX_ATTACHMENT_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }
  const metadata = files.map(({ id, name, size, mime }) => ({ id, name, size, mime, status: "removed" }));
  const { error: updateError } = await client.from("mailbox_messages").update({
    attachments: metadata, attachments_cleaned_at: new Date().toISOString()
  }).eq("id", messageId).is("attachments_cleaned_at", null);
  if (updateError) throw updateError;
  return true;
}

export async function cleanupExpiredMailboxAttachments() {
  const client = serviceClient();
  const { data, error } = await client.from("mailbox_messages")
    .select("id").is("attachments_cleaned_at", null)
    .lte("attachment_expires_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("attachment_expires_at", { ascending: true }).limit(100);
  if (error) throw error;
  let cleaned = 0;
  for (const item of data || []) {
    if (await cleanupMailboxAttachments(item.id)) cleaned++;
  }
  return cleaned;
}
