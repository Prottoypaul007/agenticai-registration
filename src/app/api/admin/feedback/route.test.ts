import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), serviceClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser, serviceClient: mocks.serviceClient }));
import { GET, PUT } from "./route";

describe("admin feedback access", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("never reads anonymous responses for an unauthenticated visitor", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PUT(new NextRequest("http://localhost/api/admin/feedback", { method: "PUT", body: "{}" }))).status).toBe(401);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("rejects a workshop schedule before the workshop date", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const response = await PUT(new NextRequest("http://localhost/api/admin/feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "workshop-2", opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true })
    }));
    expect(response.status).toBe(400);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});
