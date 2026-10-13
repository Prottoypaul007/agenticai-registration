import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), serviceClient: vi.fn(), sendGmail: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  adminUser: mocks.adminUser, serviceClient: mocks.serviceClient
}));
vi.mock("@/lib/gmail", () => ({
  GmailDeliveryUncertainError: class extends Error {}, sendGmailMessage: mocks.sendGmail
}));
vi.mock("@/lib/mailbox-attachment-cleanup", () => ({ cleanupMailboxAttachments: mocks.cleanup }));
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
  it("downloads the confirmed resource and sends it only to the claimed recipient", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin-1" });
    const payload = Buffer.from("private lesson notes");
    const download = vi.fn().mockResolvedValue({ data: new Blob([payload]), error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "delivery-1" }, error: null }) })
    }) }) });
    mocks.serviceClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: {
        id: "delivery-1", message_id: "message-1", email: "one@example.com", subject: "Resources", body: "",
        attachments: [{ id: "file-1", name: "notes.pdf", mime: "application/pdf", size: payload.length,
          path: "message-1/file-1", status: "ready" }]
      }, error: null }),
      storage: { from: vi.fn().mockReturnValue({ download }) },
      from: vi.fn().mockReturnValue({ update })
    });
    mocks.sendGmail.mockResolvedValue(undefined);
    mocks.cleanup.mockResolvedValue(true);
    const response = await POST(new NextRequest("http://localhost/api/admin/mailbox", {
      method: "POST", body: JSON.stringify({ action: "send_one", id: "00000000-0000-0000-0000-000000000001" })
    }));
    expect(response.status).toBe(200);
    expect(download).toHaveBeenCalledWith("message-1/file-1");
    expect(mocks.sendGmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "one@example.com", attachments: [{ name: "notes.pdf", contentType: "application/pdf", data: payload }]
    }));
    expect(mocks.cleanup).toHaveBeenCalledWith("message-1");
  });
});
