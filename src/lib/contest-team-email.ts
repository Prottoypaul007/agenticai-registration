import { sendGmailMessage } from "@/lib/gmail";
import { EVENT_TITLE } from "@/lib/utils";
import type { ContestParticipant, ContestTeam } from "@/lib/contest-teams";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export async function sendContestTeamEmail(member: ContestParticipant, team: ContestTeam) {
  if (!team.members.some(person => person.source === member.source && person.reference === member.reference))
    throw new Error("Member does not belong to the selected team");
  const list = team.members.map(person => `<li>${escapeHtml(person.full_name)} — ${escapeHtml(person.phone || "No contact number provided")}</li>`).join("");
  const textList = team.members.map(person => `- ${person.full_name}: ${person.phone || "No contact number provided"}`).join("\n");
  await sendGmailMessage({
    to: member.email,
    reference: member.reference,
    subject: `${EVENT_TITLE} contest team: ${team.name}`,
    html: `<div style="max-width:580px;margin:auto;font-family:Arial,sans-serif;color:#13233a;line-height:1.6"><h1 style="font-size:24px">Your contest team</h1><p>Hello ${escapeHtml(member.full_name)},</p><p>Your team for the ${escapeHtml(EVENT_TITLE)} contest is <strong>${escapeHtml(team.name)}</strong>.</p><p>Team members and contact numbers:</p><ul>${list}</ul><p style="font-size:12px;color:#64748b">This mailbox is not monitored.</p></div>`,
    text: `Hello ${member.full_name},\n\nYour team for the ${EVENT_TITLE} contest is ${team.name}.\n\nTeam members and contact numbers:\n${textList}\n\nThis mailbox is not monitored.`
  });
}
