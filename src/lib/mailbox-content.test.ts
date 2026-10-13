import { describe, expect, it } from "vitest";
import { renderMailboxBody } from "./mailbox-content";

describe("mailbox message formatting", () => {
  it("renders paragraphs, line breaks, bold, italic, and bullets", () => {
    const html = renderMailboxBody("Hello **team**\nWelcome *everyone*\n\n- Bring a laptop\n- Be on time");
    expect(html).toContain("<p>Hello <strong>team</strong><br>Welcome <em>everyone</em></p>");
    expect(html).toContain("<ul><li>Bring a laptop</li><li>Be on time</li></ul>");
  });
  it("escapes HTML from the admin's message before previewing or sending", () => {
    const html = renderMailboxBody('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
