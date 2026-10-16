import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { unicodeToBijoy } from "@abdalgolabs/ansi-unicode-converter";
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ExportGroup } from "@/lib/registration-export";

type Registration = Record<string, unknown> & { registration_group: string };
const ink = rgb(0.09, 0.15, 0.24);
const muted = rgb(0.39, 0.45, 0.53);
const cyan = rgb(0.0, 0.69, 0.8);
const pale = rgb(0.94, 0.97, 0.98);
const pageWidth = PageSizes.A4[1];
const pageHeight = PageSizes.A4[0];
const tableTop = 340;
const headerHeight = 30;
type CachedImage = { image: PDFImage; width: number; height: number };
export type PdfDay = 1 | 2;
export type PdfSheet = "attendance" | "honorarium";
const sutonniFile = path.join(process.cwd(), "font", "SutonnyMJ Regular.ttf");
const banglaRuns = (text: string) => text.match(/[\u0964-\u09ff]+|[^\u0964-\u09ff]+/g) || [];
const sutonniPixels = (size: number) => Math.round(size * 2.6);

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

async function measureCell(text: string, size: number, latin: PDFFont, widths: Map<string, number>) {
  const key = `${text}\u0000${size}\u0000${latin.name}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;
  let width = 0;
  for (const run of banglaRuns(text)) {
    if (!/[\u0964-\u09ff]/.test(run)) width += latin.widthOfTextAtSize(run, size);
    else width += (await sharp({ text: { text: xml(unicodeToBijoy(run)), font: `SutonnyMJ ${sutonniPixels(size)}`,
      fontfile: sutonniFile, rgba: true, dpi: 72 } }).metadata()).width! / 2;
  }
  widths.set(key, width);
  return width;
}

async function drawCell(pdf: PDFDocument, page: PDFPage, text: string, x: number, y: number,
  maxWidth: number, size: number, latin: PDFFont, cache: Map<string, CachedImage>,
  widths: Map<string, number>, secondary = false) {
  let content = text || "-";
  if (/^[\x20-\x7e]+$/.test(content)) {
    page.drawText(clipAscii(content, maxWidth, size, latin), { x, y, size, font: latin, color: secondary ? muted : ink });
    return;
  }
  if (await measureCell(content, size, latin, widths) > maxWidth) {
    const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(content)].map(item => item.segment);
    let low = 0; let high = segments.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = segments.slice(0, middle).join("").trimEnd() + "...";
      if (await measureCell(candidate, size, latin, widths) <= maxWidth) low = middle;
      else high = middle - 1;
    }
    content = low ? segments.slice(0, low).join("").trimEnd() + "..." : "...";
  }
  let cursor = x;
  for (const run of banglaRuns(content)) {
    if (!/[\u0964-\u09ff]/.test(run)) {
      page.drawText(run, { x: cursor, y, size, font: latin, color: secondary ? muted : ink });
      cursor += latin.widthOfTextAtSize(run, size);
      continue;
    }
    const key = `${run}\u0000${size}\u0000${secondary}`;
    let rendered = cache.get(key);
    if (!rendered) {
      const foreground = secondary ? "#64748b" : "#17263d";
      const result = await sharp({ text: {
        text: `<span foreground="${foreground}">${xml(unicodeToBijoy(run))}</span>`,
        font: `SutonnyMJ ${sutonniPixels(size)}`, fontfile: sutonniFile, rgba: true, dpi: 72
      } }).png().toBuffer({ resolveWithObject: true });
      rendered = { image: await pdf.embedPng(result.data), width: result.info.width / 2, height: result.info.height / 2 };
      cache.set(key, rendered);
    }
    page.drawImage(rendered.image, { x: cursor, y: y - 2, width: rendered.width, height: rendered.height });
    cursor += rendered.width;
  }
}

async function drawWrappedCell(pdf: PDFDocument, page: PDFPage, text: string, x: number, top: number,
  maxWidth: number, size: number, latin: PDFFont, cache: Map<string, CachedImage>,
  widths: Map<string, number>, maxLines: number, secondary = false) {
  const content = text || "-";
  const width = (candidate: string) => measureCell(candidate, size, latin, widths);
  const lines: string[] = [];
  let remaining = content;
  while (remaining && lines.length < maxLines) {
    if (await width(remaining) <= maxWidth) { lines.push(remaining); break; }
    if (lines.length === maxLines - 1) { lines.push(remaining); break; }
    const parts = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(remaining)].map(item => item.segment);
    let low = 1; let high = parts.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (await width(parts.slice(0, middle).join("")) <= maxWidth) low = middle;
      else high = middle - 1;
    }
    const prefix = parts.slice(0, low).join("");
    const space = prefix.lastIndexOf(" ");
    const take = space > prefix.length * 0.55 ? space : prefix.length;
    lines.push(remaining.slice(0, take).trim());
    remaining = remaining.slice(take).trim();
  }
  for (const [index, line] of lines.entries())
    await drawCell(pdf, page, line, x, top - 10 - index * 10, maxWidth, size, latin, cache, widths, secondary);
}

const bengaliDigits = (number: number) => String(number).replace(/[0-9]/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
const days = [
  { number: 1, label: "প্রথম দিন", date: "১৭ অক্টোবর ২০২৬", title: "Workshop on Agentic Architecture: Next-Gen Software Development" },
  { number: 2, label: "দ্বিতীয় দিন", date: "১৮ অক্টোবর, ২০২৬", title: "Workshop on Agentic Systems in Action: Build, Evaluate, and Showcase" }
] as const;

function venueInBangla(venue: string) {
  return /^Institute of Information Technology \(IIT\), University of Dhaka$/i.test(venue.trim())
    ? "ইনস্টিটিউট অব ইনফরমেশন টেকনোলজি (আইআইটি), ঢাকা বিশ্ববিদ্যালয়" : venue;
}

export async function buildRegistrationPdf(outsiders: Record<string, unknown>[],
  batch14: Record<string, unknown>[], group: ExportGroup, venue: string, selectedDay: PdfDay, selectedSheet: PdfSheet) {
  const pdf = await PDFDocument.create();
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cache = new Map<string, CachedImage>();
  const widths = new Map<string, number>();
  const logoDir = path.join(process.cwd(), "public", "partners");
  const [duLogo, iitLogo, icsetepLogo] = await Promise.all([
    readFile(path.join(logoDir, "du.jpg")).then(bytes => pdf.embedJpg(bytes)),
    readFile(path.join(logoDir, "du-iit.png")).then(bytes => pdf.embedPng(bytes)),
    readFile(path.join(logoDir, "icsetp.jpeg")).then(bytes => pdf.embedJpg(bytes))
  ]);
  const rows = ([
    ...outsiders.map(row => ({ ...row, registration_group: "Outside" })),
    ...batch14.map(row => ({ ...row, registration_group: "Batch 14" }))
  ] as Registration[])
    .filter(row => row.qr_status === "sent" && row.registration_status !== "rejected")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const groupName = group === "all" ? "উভয় নিবন্ধন দল" : group === "outsiders" ? "ওয়েবসাইট নিবন্ধন" : "বিএসএসই ১৪তম ব্যাচ";
  const write = (page: PDFPage, text: string, x: number, y: number, width: number, size = 9,
    isBold = false, secondary = false) => drawCell(pdf, page, text, x, y, width, size,
    isBold ? bold : latin, cache, widths, secondary);
  pdf.setTitle("Workshop attendance and honorarium sheets");
  pdf.setAuthor("Agentic AI Workshop Administration");
  pdf.setSubject("Private daily attendance and honorarium records");

  for (const day of days.filter(item => item.number === selectedDay)) {
    const dayRows = rows.filter(row => value(row, "attendance") !== (day.number === 1 ? "Day 2 Only" : "Day 1 Only"));
    for (const kind of [selectedSheet]) {
      const rowHeight = kind === "attendance" ? 43 : 62;
      const rowsPerPage = kind === "attendance" ? 6 : 4;
      const columns = kind === "attendance"
        ? [36, 86, 203, 348, 437, 613, 806]
        : [36, 86, 250, 425, 493, 552, 617, 806];
      const totalPages = Math.max(1, Math.ceil(dayRows.length / rowsPerPage));
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const page = pdf.addPage([pageWidth, pageHeight]);
        const pageRows = dayRows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
        page.drawRectangle({ x: 0, y: pageHeight - 12, width: pageWidth, height: 12, color: cyan });
        page.drawImage(duLogo, { x: 38, y: 514, width: 45, height: 57 });
        page.drawImage(iitLogo, { x: 103, y: 524, width: 96, height: 52 });
        page.drawImage(icsetepLogo, { x: 744, y: 518, width: 54, height: 54 });
        await write(page, "প্রকল্প: আইসিএসইটিইপি", 215, 557, 505, 10.5, true);
        await write(page, "আইআইটি, ঢাকা বিশ্ববিদ্যালয়", 215, 538, 505, 10);
        await write(page, "কর্মশালার নাম:", 36, 494, 180, 10, true);
        await write(page, day.title, 36, 473, 770, 12, true);
        await write(page, `তারিখ: ${day.date}`, 36, 444, 190, 9.5);
        await write(page, `স্থান: ${venueInBangla(venue)}`, 240, 444, 566, 9.5);
        await write(page, `${day.label} - ${kind === "attendance" ? "হাজিরা শিট" : "সম্মানী শিট"}`, 36, 407, 480, 16, true);
        await write(page, `${groupName}, কিউআর পাঠানো অংশগ্রহণকারী: ${bengaliDigits(dayRows.length)} জন`, 36, 379, 700, 9, false, true);
        page.drawRectangle({ x: 36, y: tableTop, width: pageWidth - 72, height: headerHeight, color: pale });
        const headings = kind === "attendance"
          ? [["ক্রমিক নং", 42, 38], ["নাম", 93, 103], ["প্রতিষ্ঠান", 210, 130],
            ["মোবাইল নম্বর", 355, 75], ["ইমেইল", 444, 160], ["স্বাক্ষর", 620, 176]] as const
          : [["ক্রমিক নং", 42, 38], ["নাম, প্রতিষ্ঠান, মোবাইল, ইমেইল", 93, 150], ["ব্যাংক অ্যাকাউন্ট", 257, 160],
            ["সম্মানী গ্রস", 432, 55], ["ট্যাক্স", 500, 46], ["নেট সম্মানী", 559, 52], ["স্বাক্ষর", 624, 174]] as const;
        for (const [heading, x, width] of headings) await write(page, heading, x, 351, width, 8.2, true);
        if (!pageRows.length) await write(page, "এই দিনের জন্য কোনো কিউআর পাঠানো অংশগ্রহণকারী নেই।", 45, 313, 700, 10);

        for (const [index, row] of pageRows.entries()) {
          const top = tableTop - index * rowHeight;
          const address = value(row, "institution");
          if (index % 2 === 1) page.drawRectangle({ x: 36, y: top - rowHeight, width: pageWidth - 72, height: rowHeight, color: pale });
          page.drawLine({ start: { x: 36, y: top - rowHeight }, end: { x: 806, y: top - rowHeight }, thickness: 0.5, color: rgb(0.79, 0.84, 0.88) });
          await write(page, bengaliDigits(pageIndex * rowsPerPage + index + 1), 54, top - 24, 25, 9);
          if (kind === "attendance") {
            await drawWrappedCell(pdf, page, value(row, "full_name"), 93, top, 103, 8.5, bold, cache, widths, 3);
            await drawWrappedCell(pdf, page, address, 210, top, 130, 8, latin, cache, widths, 3);
            await drawWrappedCell(pdf, page, value(row, "phone"), 355, top, 75, 8.5, latin, cache, widths, 2);
            await drawWrappedCell(pdf, page, value(row, "email"), 444, top, 162, 8, latin, cache, widths, 3);
            page.drawLine({ start: { x: 623, y: top - 33 }, end: { x: 795, y: top - 33 }, thickness: 0.5, color: rgb(0.68, 0.75, 0.81) });
          } else {
            await drawWrappedCell(pdf, page, value(row, "full_name"), 93, top, 150, 8.3, bold, cache, widths, 2);
            await drawWrappedCell(pdf, page, `প্রতিষ্ঠান: ${address}`, 93, top - 18, 150, 7.5, latin, cache, widths, 2, true);
            await write(page, `মোবাইল: ${value(row, "phone")}`, 93, top - 47, 150, 7.7, false, true);
            await write(page, `ইমেইল: ${value(row, "email")}`, 93, top - 57, 150, 7.7, false, true);
            await drawWrappedCell(pdf, page, value(row, "bank_name"), 257, top, 160, 8.3, latin, cache, widths, 2);
            await drawWrappedCell(pdf, page, `শাখা: ${value(row, "bank_branch")}`, 257, top - 23, 160, 7.7, latin, cache, widths, 2, true);
            await write(page, `হিসাব: ${value(row, "bank_account_number")}`, 257, top - 54, 160, 7.7, false, true);
            await write(page, "১,২০০", 435, top - 35, 50, 9, true);
            await write(page, "২৮০", 502, top - 35, 43, 9, true);
            await write(page, "৯২০", 559, top - 35, 50, 9, true);
            page.drawLine({ start: { x: 625, y: top - 46 }, end: { x: 795, y: top - 46 }, thickness: 0.5, color: rgb(0.68, 0.75, 0.81) });
          }
        }
        for (const x of columns) page.drawLine({
          start: { x, y: tableTop - pageRows.length * rowHeight }, end: { x, y: tableTop + headerHeight },
          thickness: 0.45, color: rgb(0.75, 0.82, 0.86)
        });
        page.drawLine({ start: { x: 36, y: 40 }, end: { x: 806, y: 40 }, thickness: 0.6, color: cyan });
        await write(page, kind === "attendance" ? "হাজিরা নিশ্চিত করতে স্বাক্ষর নিন।" : "সম্মানী গ্রহণের পর স্বাক্ষর নিন।", 36, 24, 550, 8, false, true);
        await write(page, `পৃষ্ঠা ${bengaliDigits(pageIndex + 1)} / ${bengaliDigits(totalPages)}`, 716, 24, 90, 8, false, true);
      }
    }
  }
  return pdf.save();
}
