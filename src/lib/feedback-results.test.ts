import { describe, expect, it } from "vitest";
import { summarizeFeedback } from "./feedback-results";

describe("anonymous administrative summaries", () => {
  it("keeps workshop metrics separate and returns only aggregate background data", () => {
    const result = summarizeFeedback([
      { academic_discipline: "Software Engineering", software_credits: "20–29 credits", ai_use_frequency: "Daily",
        ai_tools: ["ChatGPT", "Claude"], ai_activities: ["Debugging"], ai_coursework: "Yes", agentic_coursework: "No", agentic_familiarity: 4 }
    ], [
      { overall_quality: 5, clarity: 4, relevance: 5, examples: 4, confidence: 3, pacing: "Appropriate", most_valuable: "Examples", improvements: "" }
    ], [
      { overall_quality: 3, clarity: 3, relevance: 4, examples: 4, confidence: 5, pacing: "Too fast", most_valuable: "Building", improvements: "More time" }
    ]);
    expect(result.background.total).toBe(1);
    expect(result.background.ai_tools.find(item => item.label === "Claude")?.count).toBe(1);
    expect(result["workshop-1"].ratings.overall_quality.average).toBe(5);
    expect(result["workshop-2"].ratings.overall_quality.average).toBe(3);
    expect(result["workshop-2"].comments.improvements).toEqual(["More time"]);
    expect(JSON.stringify(result.background)).not.toContain("email");
  });
});
