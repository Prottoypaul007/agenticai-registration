import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { summarizeFeedback } from "@/lib/feedback-results";
import { buildFeedbackPdf } from "@/lib/feedback-pdf";

describe("feedback PDF export", () => {
  it("creates a report when a workshop has no responses", async () => {
    const pdf = await buildFeedbackPdf(summarizeFeedback([], []), "workshop-2");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).not.toContain("Helvetica");
  });
  it("renders both anonymous workshop reports, including long comments", async () => {
    const first = Array.from({ length: 15 }, (_, index) => ({
      form_key: "workshop-1", response_version: 2, learning_helpfulness: "Very helpful",
      outcome_confidence: "Somewhat confident", focus_area: "Agent roles and planning",
      future_workshops: "Yes", improvements: `${index + 1}. More examples for agent workflows. `.repeat(12),
      course_support: "Yes", academic_year: "3rd Year", course_suggestions: "Include practical projects."
    }));
    const results = summarizeFeedback(first, [{
      form_key: "workshop-2", response_version: 2, learning_helpfulness: "Extremely helpful",
      outcome_confidence: "Very confident", focus_area: "Testing and evaluating behavior",
      future_workshops: "Yes", improvements: "আরও hands-on সময় দিন।",
      course_support: "Yes", academic_year: "4th Year", course_suggestions: "Tool integration."
    }]);
    const pdf = await buildFeedbackPdf(results, "all");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-10).toString()).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(10_000);
    if (process.env.PDF_PREVIEW_PATH) await writeFile(process.env.PDF_PREVIEW_PATH, pdf);
  });
});
