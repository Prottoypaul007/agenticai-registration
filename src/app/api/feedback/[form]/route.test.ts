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
  const answers = { learning_helpfulness: "Very helpful", outcome_confidence: "Somewhat confident",
    focus_area: "Agentic architecture and workflows", future_workshops: "Yes", improvements: "",
    course_support: "Yes", academic_year: "3rd Year", course_suggestions: "Architectures" };
  const body = { request_id: "74882d94-1bda-40a4-b034-50a72930290c", answers };
  it("accepts both workshops independently without auth or identifying metadata", async () => {
    expect((await POST(request(body), context("workshop-1"))).status).toBe(201);
    const secondAnswers = { ...answers, focus_area: "Testing and evaluating behavior" };
    const second = { request_id: "f02e371d-f01d-4f7e-b89c-c7f99e244dc3", answers: secondAnswers };
    expect((await POST(request(second), context("workshop-2"))).status).toBe(201);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "submit_workshop_feedback_v2", { p_form: "workshop-1", p_answers: answers, p_request_id: body.request_id });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "submit_workshop_feedback_v2", { p_form: "workshop-2", p_answers: secondAnswers, p_request_id: second.request_id });
  });
  it("rejects a Day 1 focus option submitted to Day 2", async () => {
    expect((await POST(request(body), context("workshop-2"))).status).toBe(400);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("rejects identifiers and invalid answers before database access", async () => {
    const response = await POST(request({ ...body, answers: { ...answers, email: "a@example.com" } }), context("workshop-1"));
    expect(response.status).toBe(400);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("retires the pre-workshop questionnaire", async () => {
    expect((await POST(request(body), context("pre-workshop"))).status).toBe(404);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("treats retrying the same request as a success", async () => {
    mocks.rpc.mockResolvedValue({ data: "already_saved", error: null });
    expect((await POST(request(body), context("workshop-1"))).status).toBe(200);
  });
  it("enforces database availability", async () => {
    mocks.rpc.mockResolvedValue({ data: "unavailable", error: null });
    expect((await POST(request(body), context("workshop-1"))).status).toBe(403);
  });
});
