import path from "node:path";
import sharp from "sharp";
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ExportGroup } from "@/lib/registration-export";

type Registration = Record<string, unknown> & { registration_group: string };
const ink = rgb(0.09, 0.15, 0.24);
const muted = rgb(0.39, 0.45, 0.53);
const cyan = rgb(0.0, 0.69, 0.8);
const pale = rgb(0.94, 0.97, 0.98);
const pageWidth = PageSizes.A4[1];
const pageHeight = PageSizes.A4[0];
const rowsPerPage = 12;
const rowHeight = 34;

function value(row: Registration, key: string) {
  return String(row[key] ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function clipAscii(text: string, maxWidth: number, size: number, font: PDFFont) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ending = "...";
  const limit = maxWidth - font.widthOfTextAtSize(ending, size);
  let result = "";
  for (const character of text) {
    if (font.widthOfTextAtSize(result + character, size) > limit) break;
    result += character;
  }
  return result.trimEnd() + ending;
}

function xml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

async function drawCell(pdf: PDFDocument, page: PDFPage, text: string, x: number, y: number,
  maxWidth: number, size: number, latin: PDFFont, fontfile: string, secondary = false) {
  const content = text || "-";
  if (/^[\x20-\x7e]+$/.test(content)) {
    page.drawText(clipAscii(content, maxWidth, size, latin), { x, y, size, font: latin, color: secondary ? muted : ink });
    return;
  }
  const fontSize = Math.round(size * 2);
  const foreground = secondary ? "#64748b" : "#17263d";
  const render = async (value: string) => sharp({ text: {
    text: `<span foreground="${foreground}">${xml(value)}</span>`,
    font: `Noto Sans Bengali ${fontSize}`, fontfile, rgba: true, dpi: 72
  } }).png().toBuffer({ resolveWithObject: true });
  let result = await render(content);
  if (result.info.width / 2 > maxWidth) {
    const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(content)].map(item => item.segment);
    let low = 0; let high = segments.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = await render(segments.slice(0, middle).join("").trimEnd() + "...");
      if (candidate.info.width / 2 <= maxWidth) { low = middle; result = candidate; }
      else high = middle - 1;
    }
    if (low === 0) result = await render("...");
  }
  const image = await pdf.embedPng(result.data);
  page.drawImage(image, { x, y: y - 2, width: result.info.width / 2, height: result.info.height / 2 });
}

export async function buildRegistrationPdf(outsiders: Record<string, unknown>[],
  batch14: Record<string, unknown>[], group: ExportGroup, now = new Date()) {
  const pdf = await PDFDocument.create();
  const fontfile = path.join(process.cwd(), "public", "fonts", "NotoSansBengali-Regular.ttf");
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const rows = ([
    ...outsiders.map(row => ({ ...row, registration_group: "Outside" })),
    ...batch14.map(row => ({ ...row, registration_group: "Batch 14" }))
  ] as Registration[]).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const groupName = group === "all" ? "Both groups" : group === "outsiders" ? "Outside registrations" : "Batch 14 registrations";
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(now);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  pdf.setTitle(`Workshop participant roster - ${groupName}`);
  pdf.setAuthor("Agentic AI Workshop Administration");
  pdf.setSubject("Private participant registration roster");

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: pageHeight - 13, width: pageWidth, height: 13, color: cyan });
    page.drawText("WORKSHOP PARTICIPANT ROSTER", { x: 36, y: 539, size: 18, font: bold, color: ink });
    page.drawText(`${groupName}  |  ${rows.length} records  |  Generated ${generated} (Bangladesh time)`,
      { x: 36, y: 514, size: 9.5, font: latin, color: muted });
    page.drawText("A concise admin list. Payment and bank details remain in the CSV export.",
      { x: 36, y: 493, size: 9, font: latin, color: muted });
    page.drawRectangle({ x: 36, y: 458, width: pageWidth - 72, height: 27, color: ink });
    for (const [label, x] of [["#", 44], ["GROUP", 76], ["PARTICIPANT", 155],
      ["CONTACT", 325], ["REFERENCE", 545], ["STATUS", 680]] as const) {
      page.drawText(label, { x, y: 467, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    }
    const pageRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    if (!pageRows.length) page.drawText("No registrations found for this selection.",
      { x: 44, y: 424, size: 11, font: latin, color: muted });
    for (const [index, row] of pageRows.entries()) {
      const top = 458 - index * rowHeight;
      if (index % 2 === 1) page.drawRectangle({ x: 36, y: top - rowHeight, width: pageWidth - 72, height: rowHeight, color: pale });
      page.drawLine({ start: { x: 36, y: top - rowHeight }, end: { x: pageWidth - 36, y: top - rowHeight },
        thickness: 0.4, color: rgb(0.86, 0.9, 0.93) });
      const primary = top - 14;
      const secondary = top - 27;
      await drawCell(pdf, page, String(pageIndex * rowsPerPage + index + 1), 44, primary, 25, 9, latin, fontfile);
      await drawCell(pdf, page, row.registration_group, 76, primary, 72, 9, latin, fontfile);
      await drawCell(pdf, page, value(row, "full_name"), 155, primary, 162, 9.5, latin, fontfile);
      if (value(row, "department")) await drawCell(pdf, page, value(row, "department"), 155, secondary, 162, 8, latin, fontfile, true);
      await drawCell(pdf, page, value(row, "email"), 325, primary, 211, 8.5, latin, fontfile);
      await drawCell(pdf, page, value(row, "phone"), 325, secondary, 211, 8.5, latin, fontfile, true);
      await drawCell(pdf, page, value(row, "reference"), 545, primary, 127, 8.5, latin, fontfile);
      await drawCell(pdf, page, value(row, "registration_status") || "registered", 680, primary, 118, 8.5, latin, fontfile);
      await drawCell(pdf, page, `QR: ${value(row, "qr_status") || "pending"}`.replaceAll("_", " "),
        680, secondary, 118, 8, latin, fontfile, true);
    }
    page.drawLine({ start: { x: 36, y: 35 }, end: { x: pageWidth - 36, y: 35 }, thickness: 0.6, color: cyan });
    page.drawText("Confidential admin export", { x: 36, y: 20, size: 8, font: latin, color: muted });
    page.drawText(`Page ${pageIndex + 1} of ${totalPages}`, { x: pageWidth - 105, y: 20, size: 8, font: latin, color: muted });
  }
  return pdf.save();
}
