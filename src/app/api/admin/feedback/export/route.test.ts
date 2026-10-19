import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ adminUser: vi.fn(), loadFeedbackResults: vi.fn(), buildFeedbackPdf: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ adminUser: mocks.adminUser }));
vi.mock("@/lib/feedback-results-server", () => ({ loadFeedbackResults: mocks.loadFeedbackResults }));
vi.mock("@/lib/feedback-pdf", () => ({ buildFeedbackPdf: mocks.buildFeedbackPdf }));
import { GET } from "./route";

describe("admin feedback PDF export", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("does not expose anonymous answers to an unauthenticated visitor", async () => {
    mocks.adminUser.mockResolvedValue(null);
    expect((await GET(new NextRequest("http://localhost/api/admin/feedback/export"))).status).toBe(401);
    expect(mocks.loadFeedbackResults).not.toHaveBeenCalled();
  });
  it("rejects an invalid report selection before reading responses", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    expect((await GET(new NextRequest("http://localhost/api/admin/feedback/export?form=other"))).status).toBe(400);
    expect(mocks.loadFeedbackResults).not.toHaveBeenCalled();
  });
  it("downloads only the selected report as a PDF", async () => {
    mocks.adminUser.mockResolvedValue({ id: "admin" });
    const results = { "workshop-1": { total: 1 } };
    mocks.loadFeedbackResults.mockResolvedValue(results);
    mocks.buildFeedbackPdf.mockResolvedValue(Buffer.from("%PDF-example"));
    const response = await GET(new NextRequest("http://localhost/api/admin/feedback/export?form=workshop-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("workshop-feedback-workshop-1.pdf");
    expect(mocks.buildFeedbackPdf).toHaveBeenCalledExactlyOnceWith(results, "workshop-1");
  });
});
