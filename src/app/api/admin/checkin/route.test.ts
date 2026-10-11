import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTicket } from "@/lib/checkin";

const { adminUser, rpc } = vi.hoisted(() => ({ adminUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser, serviceClient: () => ({ rpc }) }));
import { POST } from "./route";

const ticket = () => JSON.stringify(createTicket({ reference: "AGNT-ABCDEF123456", name: "Test Participant", institution: "DU IIT", attendance: "Both Days" }));
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/checkin", { method: "POST", body: JSON.stringify(body) });

describe("admin check-in route", () => {
  beforeEach(() => { process.env.CHECKIN_SIGNING_SECRET = "a-long-test-secret-that-is-at-least-32-characters"; adminUser.mockReset(); rpc.mockReset(); });
  it("requires admin authentication", async () => {
    adminUser.mockResolvedValue(null);
    expect((await POST(request({ ticket: ticket(), day: 1 }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a tampered QR before database access", async () => {
    adminUser.mockResolvedValue({ id: "admin-id" });
    const altered = JSON.stringify({ ...JSON.parse(ticket()), name: "Someone Else" });
    expect((await POST(request({ ticket: altered, day: 1 }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes a valid QR to the atomic database function", async () => {
    adminUser.mockResolvedValue({ id: "admin-id" });
    rpc.mockResolvedValue({ data: { status: "already_checked_in", name: "Test Participant" }, error: null });
    const response = await POST(request({ ticket: ticket(), day: 1 }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_check_in", { p_reference: "AGNT-ABCDEF123456", p_day: 1, p_admin_id: "admin-id" });
  });
  it("reports a rejected registration without treating payment as a check-in condition", async () => {
    adminUser.mockResolvedValue({ id: "admin-id" });
    rpc.mockResolvedValue({ data: { error: "rejected_registration" }, error: null });
    const response = await POST(request({ ticket: ticket(), day: 1 }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/rejected/);
  });
});
