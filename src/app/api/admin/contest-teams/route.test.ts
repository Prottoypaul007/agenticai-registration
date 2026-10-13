import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), client: vi.fn(), sync: vi.fn(), sendEmail: vi.fn(), rpc: vi.fn(), planReads: 0
}));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.admin, serviceClient: mocks.client }));
vi.mock("@/lib/batch14-sync", () => ({ syncBatch14Registrations: mocks.sync }));
vi.mock("@/lib/contest-team-email", () => ({ sendContestTeamEmail: mocks.sendEmail }));
import { GET, POST } from "./route";

const request = (body: unknown) => new NextRequest("http://localhost/api/admin/contest-teams", {
  method: "POST", body: JSON.stringify(body)
});

describe("contest team admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planReads = 0;
    mocks.admin.mockResolvedValue({ id: "admin-id" });
    mocks.sync.mockResolvedValue({ read: 0 });
    mocks.rpc.mockResolvedValue({ data: { status: "draft" }, error: null });
    mocks.client.mockReturnValue({ rpc: mocks.rpc, from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        maybeSingle: async () => ({ data: table === "contest_team_plan" && ++mocks.planReads > 1
          ? { version: "version", status: "draft", teams: [] } : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "registrations"
          ? [{ reference: "AGNT-AAAAAAAAAAAA", full_name: "Alice", email: "alice@example.com", phone: "01700000000" }] : [], error: null }).then(resolve)
      };
      return query;
    } });
  });

  it("rejects unauthenticated access before touching team data", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: "generate" }))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("forms and saves a preview without sending email", async () => {
    const response = await POST(request({ action: "generate" }));
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith("admin-id");
    expect(mocks.rpc).toHaveBeenCalledWith("admin_save_contest_team_draft", expect.objectContaining({
      p_admin_id: "admin-id", p_teams: [expect.objectContaining({ members: [expect.objectContaining({ full_name: "Alice" })] })]
    }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
