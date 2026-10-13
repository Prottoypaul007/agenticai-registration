import { describe, expect, it } from "vitest";
import { attachmentType, validateAttachment, MAX_ATTACHMENT_BYTES, type MailboxAttachment } from "./mailbox-attachments";

const file = (size: number): MailboxAttachment => ({ id: "1", name: "guide.pdf", size, mime: "application/pdf", status: "ready" });

describe("temporary mailbox attachment validation", () => {
  it("accepts educational formats and rejects executables or unsafe names", () => {
    expect(attachmentType("slides.PPTX")).toContain("presentationml");
    expect(validateAttachment("notes.pdf", 1024, [])).toBeNull();
    expect(validateAttachment("installer.exe", 1024, [])).toMatch(/Unsupported/);
    expect(validateAttachment("evil\r\nBcc: all@example.com.pdf", 1024, [])).toMatch(/file name/);
  });
  it("enforces total size and file count, ignoring removed files", () => {
    expect(validateAttachment("second.pdf", 2, [file(MAX_ATTACHMENT_BYTES - 1)])).toMatch(/combined/);
    expect(validateAttachment("second.pdf", 1, Array.from({ length: 5 }, (_, i) => ({ ...file(1), id: String(i) })))).toMatch(/no more than 5/);
    expect(validateAttachment("second.pdf", 1, [{ ...file(1), status: "removed" }])).toBeNull();
  });
});
