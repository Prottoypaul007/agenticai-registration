export const MAILBOX_ATTACHMENT_BUCKET = "mailbox-temp";
export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const types: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet", zip: "application/zip",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", epub: "application/epub+zip"
};

export type MailboxAttachment = {
  id: string; name: string; size: number; mime: string;
  path?: string; status?: "reserved" | "ready" | "removed";
};

export function attachmentType(name: string) {
  return types[name.split(".").pop()?.toLowerCase() || ""] || null;
}

export function validateAttachment(name: string, size: number, current: MailboxAttachment[]) {
  if (!name || name.length > 150 || /[\\/\r\n\x00-\x1f]/.test(name) || name.startsWith("."))
    return "Use a file name under 150 characters without slashes or control characters.";
  if (!attachmentType(name)) return "Unsupported file type. Attach a PDF, document, spreadsheet, slide deck, image, ZIP, or text file.";
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES)
    return "Each file must be 10 MiB or less and cannot be empty.";
  const active = current.filter(item => item.status !== "removed");
  if (active.length >= MAX_ATTACHMENT_COUNT) return `Attach no more than ${MAX_ATTACHMENT_COUNT} files.`;
  if (active.reduce((sum, item) => sum + item.size, 0) + size > MAX_ATTACHMENT_BYTES)
    return "The combined attachment size must be 10 MiB or less.";
  return null;
}

export function formatAttachmentSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
