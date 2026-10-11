import { createHmac, timingSafeEqual } from "node:crypto";

export type CheckinTicket = { v: 1; reference: string; name: string; institution: string; attendance: string; signature: string };
type TicketDetails = Pick<CheckinTicket, "reference" | "name" | "institution" | "attendance">;

function secret() {
  const value = process.env.CHECKIN_SIGNING_SECRET;
  if (!value || value.length < 32) throw new Error("CHECKIN_SIGNING_SECRET must contain at least 32 characters");
  return value;
}

function digest(details: TicketDetails) {
  return createHmac("sha256", secret()).update(JSON.stringify([1, details.reference, details.name, details.institution, details.attendance])).digest("hex");
}

export function createTicket(details: TicketDetails): CheckinTicket {
  return { v: 1, ...details, signature: digest(details) };
}

export function verifyTicket(value: unknown): value is CheckinTicket {
  if (!value || typeof value !== "object") return false;
  const ticket = value as Partial<CheckinTicket>;
  if (ticket.v !== 1 || !ticket.reference?.match(/^(?:AGNT|B14)-[A-F0-9]{12}$/) ||
      typeof ticket.name !== "string" || !ticket.name || ticket.name.length > 200 ||
      typeof ticket.institution !== "string" || ticket.institution.length > 200 ||
      !["Both Days", "Day 1 Only", "Day 2 Only"].includes(ticket.attendance || "") ||
      typeof ticket.signature !== "string" || !/^[a-f0-9]{64}$/.test(ticket.signature)) return false;
  const expected = Buffer.from(digest(ticket as TicketDetails), "hex");
  return timingSafeEqual(Buffer.from(ticket.signature, "hex"), expected);
}

export function parseTicket(raw: unknown): CheckinTicket | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try { const value: unknown = JSON.parse(raw); return verifyTicket(value) ? value : null; }
  catch { return null; }
}
