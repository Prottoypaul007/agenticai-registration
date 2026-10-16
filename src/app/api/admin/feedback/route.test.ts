import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), serviceClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser, serviceClient: mocks.serviceClient }));
import { GET, PUT } from "./route";

describe("admin feedback access", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("never reads anonymous responses for an unauthenticated visitor", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/api/admin/feedback"))).status).toBe(401);
    expect((await PUT(new NextRequest("http://localhost/api/admin/feedback", { method: "PUT", body: "{}" }))).status).toBe(401);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("loads form availability without reading anonymous responses", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const forms = [{ key: "pre-workshop", opens_at: "2026-10-01T00:00:00+06:00", closes_at: null, enabled: true }];
    const select = vi.fn().mockResolvedValue({ data: forms, error: null });
    const from = vi.fn().mockReturnValue({ select });
    mocks.serviceClient.mockReturnValue({ from });
    const response = await GET(new NextRequest("http://localhost/api/admin/feedback?view=schedules"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ forms });
    expect(from).toHaveBeenCalledExactlyOnceWith("feedback_forms");
    expect(select).toHaveBeenCalledExactlyOnceWith("key,opens_at,closes_at,enabled");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("lets an admin change feedback opening independently of the workshop date", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    mocks.serviceClient.mockReturnValue({ from });
    const response = await PUT(new NextRequest("http://localhost/api/admin/feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "workshop-2", opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true })
    }));
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledExactlyOnceWith("feedback_forms");
    expect(update).toHaveBeenCalledExactlyOnceWith({ opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true });
    expect(eq).toHaveBeenCalledExactlyOnceWith("key", "workshop-2");
  });
});
