import { describe, expect, it } from "vitest";
import { summarizeFeedback } from "./feedback-results";

describe("anonymous workshop summaries", () => {
  it("keeps the workshops and old questionnaire counts separate", () => {
    const result = summarizeFeedback([
      { learning_helpfulness: "Very helpful", future_workshops: "Yes", improvements: "Clearer diagrams",
        course_support: "Yes", academic_year: "3rd Year", course_suggestions: "Architectures" },
      { learning_helpfulness: "Moderately helpful", future_workshops: "Maybe", improvements: "",
        course_support: "No", academic_year: null, course_suggestions: "" }
    ], [
      { learning_helpfulness: "Extremely helpful", future_workshops: "Yes", improvements: "More coding time",
        course_support: "Yes", academic_year: "4th Year", course_suggestions: "Deployment" }
    ], [{ form_key: "workshop-1" }]);
    expect(result["workshop-1"].total).toBe(2);
    expect(result["workshop-2"].total).toBe(1);
    expect(result["workshop-1"].course.supportPercent).toBe(50);
    expect(result["workshop-1"].course.academicYears.find(item => item.label === "3rd Year")?.count).toBe(1);
    expect(result["workshop-2"].improvements).toEqual(["More coding time"]);
    expect(result["workshop-2"].course.suggestions).toEqual(["Deployment"]);
    expect(result.historical).toEqual({ "workshop-1": 1, "workshop-2": 0 });
  });
});
