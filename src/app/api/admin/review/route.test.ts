import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), rpc: vi.fn(), qrEmail: vi.fn(), rejectionEmail: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser, serviceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/registration-email", () => ({ sendRegistrationEmail: mocks.qrEmail, sendRejectionEmail: mocks.rejectionEmail }));
import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/review", { method: "POST", body: JSON.stringify(body) });

describe("manual payment review", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.adminUser.mockResolvedValue({ id: "admin-id" });
  });
  it("requires an admin", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await POST(request({ id, action: "send_qr" }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("issues a QR only after the database records admin review", async () => {
    mocks.rpc.mockResolvedValue({ data: { reference: "AGNT-ABCDEF123456" }, error: null });
    mocks.qrEmail.mockResolvedValue(true);
    const response = await POST(request({ id, action: "send_qr" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_prepare_qr", { p_id: id, p_admin_id: "admin-id" });
    expect(mocks.qrEmail).toHaveBeenCalledWith("AGNT-ABCDEF123456");
  });
  it("does not issue a QR when review is rejected by the database", async () => {
    mocks.rpc.mockResolvedValue({ data: { error: "already_sent" }, error: null });
    expect((await POST(request({ id, action: "send_qr" }))).status).toBe(409);
    expect(mocks.qrEmail).not.toHaveBeenCalled();
  });
  it("stores a selected rejection reason and sends the cancellation email", async () => {
    mocks.rpc.mockResolvedValue({ data: { reference: "AGNT-ABCDEF123456" }, error: null });
    mocks.rejectionEmail.mockResolvedValue(true);
    const response = await POST(request({ id, action: "reject", reason: "transaction_mismatch" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_reject_registration", {
      p_id: id, p_admin_id: "admin-id", p_reason_code: "transaction_mismatch", p_reason_detail: null
    });
    expect(mocks.rejectionEmail).toHaveBeenCalledWith("AGNT-ABCDEF123456");
  });
  it("requires a written explanation for Other", async () => {
    expect((await POST(request({ id, action: "reject", reason: "other" }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
