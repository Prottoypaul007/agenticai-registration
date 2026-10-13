import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase", () => ({
  adminUser: async () => null,
  serviceClient: vi.fn(() => { throw new Error("Database must not be accessed"); })
}));
import { GET } from "./route";

describe("student search authorization", () => {
  it("does not expose registration details to unauthenticated users", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/search?q=prottoy"));
    expect(response.status).toBe(401);
  });
});
