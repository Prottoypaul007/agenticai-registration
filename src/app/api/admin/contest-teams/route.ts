import { NextRequest, NextResponse } from "next/server";
import { adminUser, serviceClient } from "@/lib/supabase";
import { syncBatch14Registrations } from "@/lib/batch14-sync";
import { formContestTeams, type ContestParticipant, type ContestTeam } from "@/lib/contest-teams";
import { sendContestTeamEmail } from "@/lib/contest-team-email";
import { GmailDeliveryUncertainError } from "@/lib/gmail";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function eligibleParticipants(): Promise<ContestParticipant[]> {
  const client = serviceClient();
  const participants: ContestParticipant[] = [];
  for (const [table, source] of [["registrations", "outsider"], ["batch14_registrations", "batch14"]] as const) {
    for (let offset = 0; ; offset += 1000) {
      let query = client.from(table).select("reference,full_name,email,phone").eq("qr_status", "sent")
        .order("created_at", { ascending: true }).range(offset, offset + 999);
      if (source === "outsider") query = query.eq("registration_status", "confirmed");
      const { data, error } = await query;
      if (error) throw new Error("Unable to load confirmed contest participants.");
      participants.push(...(data || []).map(row => ({ source, reference: row.reference,
        full_name: row.full_name, email: row.email, phone: row.phone || "" })));
      if (!data || data.length < 1000) break;
    }
  }
  return participants;
}

async function state() {
  const client = serviceClient();
  const [plan, notifications] = await Promise.all([
    client.from("contest_team_plan").select("version,status,teams,updated_at,finalized_at").eq("id", 1).maybeSingle(),
    client.from("contest_team_notifications").select("id,source,reference,team_name,full_name,email,phone,email_status,email_attempts,email_sent_at,email_error")
      .order("team_name").order("full_name")
  ]);
  if (plan.error || notifications.error) throw new Error("Contest team tables are unavailable. Apply migration 014.");
  return { plan: plan.data, notifications: notifications.data || [] };
}

export async function GET() {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const admin = await adminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { action?: unknown; version?: unknown; id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const client = serviceClient();
  try {
    if (body.action === "generate") {
      const { data: existing, error: existingError } = await client.from("contest_team_plan").select("status").eq("id", 1).maybeSingle();
      if (existingError) throw new Error("Contest team tables are unavailable. Apply migration 014.");
      if (existing?.status === "finalized") return NextResponse.json({ error: "Teams have already been finalized." }, { status: 409 });
      await syncBatch14Registrations(admin.id);
      const participants = await eligibleParticipants();
      if (!participants.length) return NextResponse.json({ error: "No QR-confirmed participants are available yet." }, { status: 409 });
      const { data, error } = await client.rpc("admin_save_contest_team_draft", {
        p_admin_id: admin.id, p_teams: formContestTeams(participants)
      });
      if (error) throw new Error(error.message);
      if (data?.error) return NextResponse.json({ error: data.error === "roster_changed" ?
        "The confirmed participant list changed. Form teams again." : "Unable to save this team preview." }, { status: 409 });
      return NextResponse.json(await state());
    }
    if (body.action === "finalize") {
      if (typeof body.version !== "string" || !uuid.test(body.version))
        return NextResponse.json({ error: "Invalid team preview version." }, { status: 400 });
      await syncBatch14Registrations(admin.id);
      const { data, error } = await client.rpc("admin_finalize_contest_teams", {
        p_admin_id: admin.id, p_version: body.version
      });
      if (error) throw new Error(error.message);
      if (data?.error) return NextResponse.json({ error: data.error === "roster_changed" ?
        "The confirmed participant list changed. Regenerate teams before sending emails." :
        data.error === "draft_changed" ? "Another admin regenerated the teams. Refresh and review them again." :
        "These teams cannot be finalized." }, { status: 409 });
      return NextResponse.json(await state());
    }
    if (body.action === "send_one") {
      if (typeof body.id !== "string" || !uuid.test(body.id))
        return NextResponse.json({ error: "Invalid notification." }, { status: 400 });
      const { data: plan, error: planError } = await client.from("contest_team_plan")
        .select("status,teams").eq("id", 1).single();
      if (planError || plan.status !== "finalized")
        return NextResponse.json({ error: "Teams must be finalized before email delivery." }, { status: 409 });
      const { data: prior, error: priorError } = await client.from("contest_team_notifications")
        .select("email_attempts,team_name").eq("id", body.id).maybeSingle();
      if (priorError) throw new Error(priorError.message);
      if (!prior) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
      const team = (plan.teams as ContestTeam[]).find(item => item.name === prior.team_name);
      if (!team) return NextResponse.json({ error: "Finalized team not found for notification." }, { status: 409 });
      const { data: notification, error: claimError } = await client.from("contest_team_notifications")
        .update({ email_status: "sending", email_error: null, email_attempts: prior.email_attempts + 1 })
        .eq("id", body.id).in("email_status", ["pending", "failed"])
        .select("id,source,reference,team_name,full_name,email,phone").maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!notification) return NextResponse.json({ error: "This notification was already sent or is being sent." }, { status: 409 });
      let emailSent = false;
      try {
        await sendContestTeamEmail(notification as ContestParticipant, team);
        emailSent = true;
        const { data: updated, error: statusError } = await client.from("contest_team_notifications")
          .update({ email_status: "sent", email_sent_at: new Date().toISOString(), email_error: null })
          .eq("id", notification.id).eq("email_status", "sending").select("id").maybeSingle();
        if (statusError || !updated) throw statusError || new Error("Delivery status was not saved");
        return NextResponse.json({ id: notification.id, email_status: "sent" });
      } catch (error) {
        if (emailSent || error instanceof GmailDeliveryUncertainError) {
          console.error("Contest email delivery needs manual review", notification.id, error);
          return NextResponse.json({ error: "Delivery may have succeeded. Review this sending status before any retry." }, { status: 503 });
        }
        const detail = error instanceof Error ? error.message : "Email delivery failed";
        await client.from("contest_team_notifications").update({ email_status: "failed", email_error: detail.slice(0, 300) })
          .eq("id", notification.id).eq("email_status", "sending");
        return NextResponse.json({ id: notification.id, email_status: "failed", error: detail });
      }
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Contest team action failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contest team action failed." }, { status: 503 });
  }
}
