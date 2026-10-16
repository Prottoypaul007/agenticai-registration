import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  return { Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props, children) };
});
import { FeedbackForm } from "./feedback-form";

describe("workshop feedback forms", () => {
  it("renders the same five-question structure with workshop-specific learning goals", () => {
    const first = renderToStaticMarkup(createElement(FeedbackForm, { form: "workshop-1" }));
    const second = renderToStaticMarkup(createElement(FeedbackForm, { form: "workshop-2" }));
    for (const html of [first, second]) {
      expect(html).toContain("Section A");
      expect(html).toContain("Section B");
      expect(html).toContain("1. How helpful");
      expect(html).toContain("2. Would you like");
      expect(html).toContain("3. What could be improved");
      expect(html).toContain("4. Do you think");
      expect(html).toContain("5. What topics");
      expect(html).toContain("Your feedback is anonymous");
      expect(html).not.toContain("What is your academic discipline");
    }
    expect(first).toContain("fundamentals and architecture");
    expect(second).toContain("build, evaluate, and showcase");
  });
});
