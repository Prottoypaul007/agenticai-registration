import { describe, expect, it } from "vitest";
import { availability, backgroundSchema, openingDate, workshopSchema } from "./feedback";

const background = {
  academic_discipline: "Software Engineering", software_credits: "20–29 credits", ai_use_frequency: "Frequently",
  ai_tools: ["ChatGPT", "Claude"], ai_activities: ["Code generation"], ai_coursework: "No",
  agentic_coursework: "Not sure", agentic_familiarity: 3
};
const workshop = { overall_quality: 5, clarity: 4, relevance: 4, examples: 5, confidence: 4,
  pacing: "Appropriate", most_valuable: "The demonstrations", improvements: "More practice time" };

describe("anonymous feedback validation", () => {
  it("accepts the finalized background answers and rejects identifiers or conflicting choices", () => {
    expect(backgroundSchema.safeParse(background).success).toBe(true);
    expect(backgroundSchema.safeParse({ ...background, email: "student@example.com" }).success).toBe(false);
    expect(backgroundSchema.safeParse({ ...background, ai_tools: ["ChatGPT", "I have not used any AI tools"] }).success).toBe(false);
    expect(backgroundSchema.safeParse({ ...background, ai_activities: ["Code generation", "I have not used AI tools"] }).success).toBe(false);
    expect(backgroundSchema.safeParse({ ...background, agentic_familiarity: 6 }).success).toBe(false);
  });
  it("limits feedback and rejects contact details in optional comments", () => {
    expect(workshopSchema.safeParse(workshop).success).toBe(true);
    expect(workshopSchema.safeParse({ ...workshop, most_valuable: "contact me at student@example.com" }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...workshop, improvements: "<script>alert(1)</script>" }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...workshop, improvements: "x".repeat(1001) }).success).toBe(false);
    expect(workshopSchema.safeParse({ ...workshop, registration_id: "AGNT-123" }).success).toBe(false);
  });
  it("uses Dhaka workshop opening times, configured closing, and manual closure", () => {
    const form = { key: "workshop-1" as const, opens_at: "2026-10-16T18:00:00Z", closes_at: "2026-10-17T18:00:00Z", enabled: true };
    expect(openingDate(form)).toBe("17 October 2026");
    expect(availability(form, new Date("2026-10-16T17:59:59Z"))).toBe("upcoming");
    expect(availability(form, new Date("2026-10-16T18:00:00Z"))).toBe("open");
    expect(availability(form, new Date("2026-10-17T18:00:00Z"))).toBe("closed");
    expect(availability({ ...form, enabled: false }, new Date("2026-10-16T18:00:00Z"))).toBe("closed");
  });
});
