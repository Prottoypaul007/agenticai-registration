import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), serviceClient: vi.fn(), sendGmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  adminUser: mocks.adminUser, serviceClient: mocks.serviceClient
}));
vi.mock("@/lib/gmail", () => ({
  GmailDeliveryUncertainError: class extends Error {}, sendGmailMessage: mocks.sendGmail
}));
import { GET, POST } from "./route";

describe("admin mailbox authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.adminUser.mockResolvedValue(null); });
  it("rejects reads and sends without an authorized admin", async () => {
    expect((await GET(new NextRequest("http://localhost/api/admin/mailbox?view=roster"))).status).toBe(401);
    expect((await POST(new NextRequest("http://localhost/api/admin/mailbox", {
      method: "POST", body: JSON.stringify({ action: "send_one", id: "00000000-0000-0000-0000-000000000001" })
    }))).status).toBe(401);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("does not send a delivery that was already claimed", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin-1" });
    mocks.serviceClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: { error: "already_claimed" }, error: null }) });
    const response = await POST(new NextRequest("http://localhost/api/admin/mailbox", {
      method: "POST", body: JSON.stringify({ action: "send_one", id: "00000000-0000-0000-0000-000000000001" })
    }));
    expect(response.status).toBe(409);
    expect(mocks.sendGmail).not.toHaveBeenCalled();
  });
});
