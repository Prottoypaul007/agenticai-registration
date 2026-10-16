import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), serviceClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ serviceClient: mocks.serviceClient }));
import { POST } from "./route";
const context = (form: string) => ({ params: Promise.resolve({ form }) });
const request = (body: unknown) => new NextRequest("http://localhost/api/feedback/workshop-1", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

describe("public anonymous feedback endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.serviceClient.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: "saved", error: null }); });
  it("accepts workshop forms independently without auth or request metadata", async () => {
    const body = { overall_quality: 5, clarity: 4, relevance: 4, examples: 3, confidence: 5, pacing: "Appropriate", most_valuable: "Useful", improvements: "" };
    expect((await POST(request(body), context("workshop-1"))).status).toBe(201);
    expect((await POST(request(body), context("workshop-2"))).status).toBe(201);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "submit_anonymous_feedback", { p_form: "workshop-1", p_answers: body });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "submit_anonymous_feedback", { p_form: "workshop-2", p_answers: body });
  });
  it("rejects identifiers and invalid answers before database access", async () => {
    const response = await POST(request({ overall_quality: 5, email: "a@example.com" }), context("workshop-1"));
    expect(response.status).toBe(400);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("enforces database availability", async () => {
    mocks.rpc.mockResolvedValue({ data: "unavailable", error: null });
    const body = { overall_quality: 5, clarity: 4, relevance: 4, examples: 3, confidence: 5, pacing: "Appropriate", most_valuable: "", improvements: "" };
    expect((await POST(request(body), context("workshop-1"))).status).toBe(403);
  });
});
