import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ adminUser: async () => ({ id: "admin" }), serviceClient: () => ({ rpc }) }));
import { PATCH } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
describe("admin payment and refund actions", () => {
  it("requires a bank transfer reference before recording a refund", async () => {
    rpc.mockReset();
    const response = await PATCH(new NextRequest("http://localhost/api/admin/participants", { method: "PATCH", body: JSON.stringify({ id, action: "mark_refunded" }) }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires payment review through the QR delivery action", async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const response = await PATCH(new NextRequest("http://localhost/api/admin/participants", { method: "PATCH", body: JSON.stringify({ id, action: "verify_payment" }) }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
