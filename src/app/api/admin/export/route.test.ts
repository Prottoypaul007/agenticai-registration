import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  adminUser: vi.fn(), serviceClient: vi.fn(), sync: vi.fn(), tables: [] as string[]
}));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser, serviceClient: mocks.serviceClient }));
vi.mock("@/lib/batch14-sync", () => ({ syncBatch14Registrations: mocks.sync }));
import { GET } from "./route";

describe("admin registration export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables.length = 0;
    mocks.adminUser.mockResolvedValue({ id: "admin-id" });
    mocks.sync.mockResolvedValue({ read: 1 });
    mocks.serviceClient.mockReturnValue({ from: (table: string) => {
      mocks.tables.push(table);
      return { select: () => ({ order: () => ({ range: async () => ({
        data: table === "registrations" ? [{ reference: "AGNT-1" }] : [{ reference: "B14-1" }], error: null
      }) }) }) };
    } });
  });

  it("requires an admin before reading participant data", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/api/admin/export"))).status).toBe(401);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });

  it("exports only the selected group and syncs the Sheet when needed", async () => {
    const outside = await GET(new NextRequest("http://localhost/api/admin/export?group=outsiders"));
    expect(await outside.text()).toContain("AGNT-1");
    expect(mocks.tables).toEqual(["registrations"]);
    expect(mocks.sync).not.toHaveBeenCalled();

    mocks.tables.length = 0;
    const batch = await GET(new NextRequest("http://localhost/api/admin/export?group=batch14"));
    expect(await batch.text()).toContain("B14-1");
    expect(mocks.tables).toEqual(["batch14_registrations"]);
    expect(mocks.sync).toHaveBeenCalledWith("admin-id");

    mocks.tables.length = 0;
    const all = await GET(new NextRequest("http://localhost/api/admin/export?group=all"));
    const csv = await all.text();
    expect(csv).toContain("AGNT-1");
    expect(csv).toContain("B14-1");
    expect(mocks.tables).toEqual(["registrations", "batch14_registrations"]);
  });

  it("rejects invalid groups", async () => {
    expect((await GET(new NextRequest("http://localhost/api/admin/export?group=unknown"))).status).toBe(400);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
});
