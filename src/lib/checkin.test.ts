import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTicket, parseTicket } from "./checkin";

const details = { reference: "AGNT-ABCDEF123456", name: "Test Participant", institution: "DU IIT", attendance: "Both Days" };
const previous = process.env.CHECKIN_SIGNING_SECRET;
beforeEach(() => { process.env.CHECKIN_SIGNING_SECRET = "a-long-test-secret-that-is-at-least-32-characters"; });
afterEach(() => { if (previous === undefined) delete process.env.CHECKIN_SIGNING_SECRET; else process.env.CHECKIN_SIGNING_SECRET = previous; });

describe("check-in ticket", () => {
  it("accepts a signed ticket with registration details", () => {
    expect(parseTicket(JSON.stringify(createTicket(details)))).toMatchObject(details);
  });
  it("rejects altered attendance or identity", () => {
    const ticket = createTicket(details);
    expect(parseTicket(JSON.stringify({ ...ticket, attendance: "Day 2 Only" }))).toBeNull();
    expect(parseTicket(JSON.stringify({ ...ticket, name: "Someone Else" }))).toBeNull();
  });
  it("rejects malformed or oversized input", () => {
    expect(parseTicket("not JSON")).toBeNull();
    expect(parseTicket("x".repeat(2001))).toBeNull();
  });
  it("accepts a signed Batch 14 ticket through the same scanner format", () => {
    const batch = { ...details, reference: "B14-ABCDEF123456" };
    expect(parseTicket(JSON.stringify(createTicket(batch)))).toMatchObject(batch);
  });
});
