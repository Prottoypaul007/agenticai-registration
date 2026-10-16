import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), serviceClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser, serviceClient: mocks.serviceClient }));
import { GET, PUT } from "./route";

describe("admin feedback access", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("never reads anonymous responses for an unauthenticated visitor", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/api/admin/feedback"))).status).toBe(401);
    expect((await PUT(new NextRequest("http://localhost/api/admin/feedback", { method: "PUT", body: "{}" }))).status).toBe(401);
    expect(mocks.serviceClient).not.toHaveBeenCalled();
  });
  it("loads form availability without reading anonymous responses", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const forms = [{ key: "workshop-1", opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true }];
    const select = vi.fn().mockResolvedValue({ data: forms, error: null });
    const from = vi.fn().mockReturnValue({ select });
    mocks.serviceClient.mockReturnValue({ from });
    const response = await GET(new NextRequest("http://localhost/api/admin/feedback?view=schedules"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ forms });
    expect(from).toHaveBeenCalledExactlyOnceWith("feedback_forms");
    expect(select).toHaveBeenCalledExactlyOnceWith("key,opens_at,closes_at,enabled");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("summarizes the new workshop questionnaire without mixing historical answers", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        range: vi.fn().mockResolvedValue({
          data: table === "workshop_feedback_v2" ? [{ form_key: "workshop-1", learning_helpfulness: "Very helpful",
            future_workshops: "Yes", improvements: "Clearer diagrams", course_support: "Yes",
            academic_year: "3rd Year", course_suggestions: "Agent architecture" }] : [{ form_key: "workshop-2" }],
          error: null
        })
      }))
    }));
    mocks.serviceClient.mockReturnValue({ from });
    const response = await GET(new NextRequest("http://localhost/api/admin/feedback"));
    expect(response.status).toBe(200);
    const { results } = await response.json();
    expect(results["workshop-1"].total).toBe(1);
    expect(results["workshop-2"].total).toBe(0);
    expect(results.historical["workshop-2"]).toBe(1);
    expect(from.mock.calls.map(([table]) => table)).toEqual(expect.arrayContaining(["workshop_feedback_v2", "workshop_feedback_responses"]));
    expect(from.mock.calls.map(([table]) => table)).not.toContain("background_survey_responses");
  });
  it("lets an admin change feedback opening independently of the workshop date", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    mocks.serviceClient.mockReturnValue({ from });
    const response = await PUT(new NextRequest("http://localhost/api/admin/feedback", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "workshop-2", opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true })
    }));
    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledExactlyOnceWith("feedback_forms");
    expect(update).toHaveBeenCalledExactlyOnceWith({ opens_at: "2026-10-17T00:00:00+06:00", closes_at: null, enabled: true });
    expect(eq).toHaveBeenCalledExactlyOnceWith("key", "workshop-2");
  });
});
