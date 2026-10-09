import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase", () => ({ adminUser: async () => null, serviceClient: vi.fn(() => { throw new Error("Database must not be accessed"); }) }));
import { GET, PATCH } from "./route";
describe("admin authorization", () => {
  it("denies participant reads and writes without an allowlisted admin", async () => {
    expect((await GET(new NextRequest("http://localhost/api/admin/participants"))).status).toBe(401);
    expect((await PATCH(new NextRequest("http://localhost/api/admin/participants", { method: "PATCH", body: "{}" }))).status).toBe(401);
  });
});
