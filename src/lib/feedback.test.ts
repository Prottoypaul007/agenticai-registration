import { describe, expect, it } from "vitest";
import { availability, formKeys, openingDate, workshopSchema, workshopSchemaFor } from "./feedback";

const answers = {
  learning_helpfulness: "Very helpful", outcome_confidence: "Somewhat confident",
  focus_area: "Agentic architecture and workflows", future_workshops: "Maybe", improvements: "",
  course_support: "Yes", academic_year: "3rd Year", course_suggestions: "Tool integration"
};

describe("workshop feedback validation", () => {
  it("exposes exactly the two workshop forms", () => {
    expect(formKeys).toEqual(["workshop-1", "workshop-2"]);
  });
  it("accepts seven main answers and requires the year only for course supporters", () => {
    expect(workshopSchema.safeParse(answers).success).toBe(true);
    expect(workshopSchema.safeParse({ ...answers, academic_year: null }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, course_support: "No", academic_year: "3rd Year" }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, course_support: "No", academic_year: null }).success).toBe(true);
    expect(workshopSchema.safeParse({ learning_helpfulness: "Very helpful", outcome_confidence: "Very confident",
      focus_area: "Agent roles and planning", future_workshops: "Maybe", course_support: "No" }).success).toBe(true);
    expect(workshopSchema.safeParse({ ...answers, learning_helpfulness: "" }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, future_workshops: "" }).success).toBe(false);
  });
  it("requires a focus option from the correct workshop", () => {
    expect(workshopSchemaFor("workshop-1").safeParse(answers).success).toBe(true);
    expect(workshopSchemaFor("workshop-2").safeParse(answers).success).toBe(false);
    expect(workshopSchemaFor("workshop-2").safeParse({ ...answers, focus_area: "Connecting tools and APIs" }).success).toBe(true);
  });
  it("rejects identifiers, long suggestions, and extra answer fields", () => {
    expect(workshopSchema.safeParse({ ...answers, improvements: "Contact me at student@example.com" }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, course_suggestions: "01" + "2".repeat(9) }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, improvements: "x".repeat(501) }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...answers, registration_id: "AGNT-123" }).success).toBe(false);
  });
  it("uses saved Dhaka opening and closing times", () => {
    const form = { key: "workshop-1" as const, opens_at: "2026-10-13T18:00:00Z", closes_at: "2026-10-17T18:00:00Z", enabled: true };
    expect(openingDate(form)).toBe("14 October 2026");
    expect(availability(form, new Date("2026-10-13T17:59:59Z"))).toBe("upcoming");
    expect(availability(form, new Date("2026-10-13T18:00:00Z"))).toBe("open");
    expect(availability(form, new Date("2026-10-17T18:00:00Z"))).toBe("closed");
    expect(availability({ ...form, enabled: false }, new Date("2026-10-14T00:00:00Z"))).toBe("closed");
  });
});
