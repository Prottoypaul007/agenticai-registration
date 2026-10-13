import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { syncBatch14Registrations } from "@/lib/batch14-sync";
import { GmailDeliveryUncertainError, sendGmailMessage } from "@/lib/gmail";
import { mailboxEmailHtml } from "@/lib/mailbox-content";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ref = { source: "outsider" | "batch14"; reference: string };

function recipientRefs(value: unknown): Ref[] | null {
  if (!Array.isArray(value) || value.length > 2000) return null;
  const refs: Ref[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || !["outsider", "batch14"].includes(item.source) ||
        typeof item.reference !== "string" || !/^(?:AGNT|B14)-[A-F0-9]{12}$/.test(item.reference)) return null;
    const key = `${item.source}:${item.reference}`;
    if (seen.has(key)) return null;
    seen.add(key);
    refs.push({ source: item.source, reference: item.reference });
  }
  return refs;
}

async function roster() {
  const client = serviceClient();
  const participants: { source: Ref["source"]; reference: string; full_name: string; email: string; phone: string | null }[] = [];
  for (const [table, source] of [["registrations", "outsider"], ["batch14_registrations", "batch14"]] as const) {
    for (let offset = 0; ; offset += 500) {
      let query = client.from(table).select("reference,full_name,email,phone").order("created_at", { ascending: false }).range(offset, offset + 499);
      if (source === "outsider") query = query.neq("registration_status", "rejected");
      const { data, error } = await query;
      if (error) throw new Error("Unable to load mailbox recipients.");
      participants.push(...(data || []).map(row => ({ ...row, source })));
      if (!data || data.length < 500) break;
    }
  }
  return participants;
}

export async function GET(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = serviceClient();
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("view") === "roster") {
      await syncBatch14Registrations(admin.id);
      return NextResponse.json({ participants: await roster() }, { headers: { "Cache-Control": "no-store" } });
    }
    if (params.get("view") === "message") {
      const id = params.get("id") || "";
      if (!uuid.test(id)) return NextResponse.json({ error: "Invalid message." }, { status: 400 });
      const message = await client.from("mailbox_messages").select("*").eq("id", id).maybeSingle();
      if (message.error) throw new Error("Mailbox tables are unavailable. Apply migration 015.");
      if (!message.data) return NextResponse.json({ error: "Message not found." }, { status: 404 });
      const deliveries = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from("mailbox_deliveries")
          .select("id,source,reference,full_name,email,status,attempts,sent_at,error")
          .eq("message_id", id).order("full_name").order("id").range(offset, offset + 499);
        if (error) throw new Error("Unable to load message delivery status.");
        deliveries.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      return NextResponse.json({ message: message.data, deliveries }, { headers: { "Cache-Control": "no-store" } });
    }
    const status = params.get("status") === "draft" ? "draft" : "queued";
    const page = Math.max(0, Math.min(10000, Number(params.get("page")) || 0));
    const { data, count, error } = await client.from("mailbox_messages").select("id,subject,body,audience,recipient_refs,status,created_at,updated_at,finalized_at", { count: "exact" })
      .eq("status", status).order("created_at", { ascending: false }).range(page * 25, page * 25 + 24);
    if (error) throw new Error("Mailbox tables are unavailable. Apply migration 015.");
    const ids = (data || []).map(row => row.id);
    const deliveryCounts: Record<string, Record<string, number>> = {};
    if (ids.length) {
      for (let offset = 0; ; offset += 500) {
        const { data: deliveries, error: deliveryError } = await client.from("mailbox_deliveries")
          .select("message_id,status,id").in("message_id", ids).order("id").range(offset, offset + 499);
        if (deliveryError) throw new Error("Unable to load email delivery status.");
        for (const delivery of deliveries || []) {
          deliveryCounts[delivery.message_id] ??= { pending: 0, sending: 0, sent: 0, failed: 0 };
          deliveryCounts[delivery.message_id][delivery.status]++;
        }
        if (!deliveries || deliveries.length < 500) break;
      }
    }
    return NextResponse.json({ messages: (data || []).map(row => ({ ...row, counts: deliveryCounts[row.id] ||
      { pending: 0, sending: 0, sent: 0, failed: 0 } })), count, page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load mailbox." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const client = serviceClient();
  try {
    if (body.action === "save" || body.action === "finalize") {
      const refs = recipientRefs(body.recipients);
      if (!refs || typeof body.subject !== "string" || body.subject.length > 200 ||
          typeof body.message !== "string" || body.message.length > 20000 ||
          !["selected", "all"].includes(String(body.audience)) ||
          (body.id !== undefined && (typeof body.id !== "string" || !uuid.test(body.id))))
        return NextResponse.json({ error: "Invalid email or recipient selection." }, { status: 400 });
      if (body.action === "finalize" && (!body.subject.trim() || !body.message.trim() || refs.length === 0))
        return NextResponse.json({ error: "Add a subject, message, and recipients before sending." }, { status: 400 });
      if (body.action === "finalize") await syncBatch14Registrations(admin.id);
      let id = body.id as string | undefined;
      if (!id) {
        const { data, error } = await client.from("mailbox_messages").insert({
          subject: body.subject, body: body.message, audience: body.audience,
          recipient_refs: refs, created_by: admin.id
        }).select("id").single();
        if (error) throw new Error("Unable to save draft. Apply migration 015.");
        id = data.id;
      } else {
        const { data, error } = await client.from("mailbox_messages").update({
          subject: body.subject, body: body.message, audience: body.audience,
          recipient_refs: refs, updated_at: new Date().toISOString()
        }).eq("id", id).eq("status", "draft").select("id").maybeSingle();
        if (error) throw new Error("Unable to save draft.");
        if (!data) return NextResponse.json({ error: "This draft was already sent or removed." }, { status: 409 });
      }
      if (body.action === "save") return NextResponse.json({ id, status: "draft" });
      const { data, error } = await client.rpc("admin_finalize_mailbox_message", {
        p_admin_id: admin.id, p_message_id: id, p_subject: body.subject,
        p_body: body.message, p_audience: body.audience, p_recipients: refs
      });
      if (error) {
        const cause = error.message;
        return NextResponse.json({ error: cause.includes("roster_changed") ? "The participant list changed. Refresh recipients and review again." :
          cause.includes("duplicate_email") ? "Two registrations share an email address. Resolve this before sending." :
          cause.includes("invalid_recipients") ? "The selected recipients are invalid. Refresh and review again." :
          "Unable to finalize this email. Apply migration 015 if needed." }, { status: 409 });
      }
      if (data?.error) return NextResponse.json({ error: "This draft cannot be sent. Refresh and review it again." }, { status: 409 });
      return NextResponse.json({ id, queued: data.queued });
    }
    if (body.action === "send_one") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return NextResponse.json({ error: "Invalid delivery." }, { status: 400 });
      const { data: claim, error: claimError } = await client.rpc("admin_claim_mailbox_delivery", {
        p_admin_id: admin.id, p_delivery_id: body.id
      });
      if (claimError) throw new Error("Unable to claim this email delivery. Apply migration 015 if needed.");
      if (claim?.error) return NextResponse.json({ error: "This email was already sent or is being sent." }, { status: 409 });
      let sent = false;
      try {
        await sendGmailMessage({ to: claim.email, subject: claim.subject,
          text: `${claim.body}\n\nThis mailbox is not monitored.`, html: mailboxEmailHtml(claim.body) });
        sent = true;
        const { data, error } = await client.from("mailbox_deliveries")
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("id", claim.id).eq("status", "sending").select("id").maybeSingle();
        if (error || !data) throw error || new Error("Delivery status could not be saved.");
        return NextResponse.json({ id: claim.id, status: "sent" });
      } catch (error) {
        if (sent || error instanceof GmailDeliveryUncertainError) {
          console.error("Mailbox email delivery needs manual review", claim.id, error);
          return NextResponse.json({ error: "Delivery may have succeeded. Check the sender mailbox before any retry." }, { status: 503 });
        }
        const detail = error instanceof Error ? error.message : "Email delivery failed";
        await client.from("mailbox_deliveries").update({ status: "failed", error: detail.slice(0, 300) })
          .eq("id", claim.id).eq("status", "sending");
        return NextResponse.json({ id: claim.id, status: "failed", error: detail });
      }
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Mailbox action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mailbox action failed." }, { status: 503 });
  }
}
