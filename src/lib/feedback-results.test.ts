import { describe, expect, it } from "vitest";
import { summarizeFeedback } from "./feedback-results";

describe("anonymous workshop summaries", () => {
  it("keeps the workshops and old questionnaire counts separate", () => {
    const result = summarizeFeedback([
      { response_version: 2, learning_helpfulness: "Very helpful", outcome_confidence: "Somewhat confident",
        focus_area: "Agentic architecture and workflows", future_workshops: "Yes", improvements: "Clearer diagrams",
        course_support: "Yes", academic_year: "3rd Year", course_suggestions: "Architectures" },
      { response_version: 1, learning_helpfulness: "Moderately helpful", future_workshops: "Maybe", improvements: "",
        course_support: "No", academic_year: null, course_suggestions: "" }
    ], [
      { response_version: 2, learning_helpfulness: "Extremely helpful", outcome_confidence: "Very confident",
        focus_area: "Testing and evaluating behavior", future_workshops: "Yes", improvements: "More coding time",
        course_support: "Yes", academic_year: "4th Year", course_suggestions: "Deployment" }
    ], [{ form_key: "workshop-1" }]);
    expect(result["workshop-1"].total).toBe(2);
    expect(result["workshop-2"].total).toBe(1);
    expect(result["workshop-1"].course.supportPercent).toBe(50);
    expect(result["workshop-1"].specificAnswers).toBe(1);
    expect(result["workshop-1"].confidence.find(item => item.label === "Somewhat confident")?.count).toBe(1);
    expect(result["workshop-2"].focusAreas.find(item => item.label === "Testing and evaluating behavior")?.count).toBe(1);
    expect(result["workshop-1"].course.academicYears.find(item => item.label === "3rd Year")?.count).toBe(1);
    expect(result["workshop-2"].improvements).toEqual(["More coding time"]);
    expect(result["workshop-2"].course.suggestions).toEqual(["Deployment"]);
    expect(result.historical).toEqual({ "workshop-1": 1, "workshop-2": 0 });
  });
});
