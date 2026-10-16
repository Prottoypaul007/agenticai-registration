import path from "node:path";
import { readFile } from "node:fs/promises";
import { unicodeToBijoy } from "@abdalgolabs/ansi-unicode-converter";
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, PageOrientation,
  Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign,
  WidthType, type FileChild
} from "docx";
import type { ExportGroup } from "@/lib/registration-export";

type Registration = Record<string, unknown>;
export type WordDay = 1 | 2;
export type WordSheet = "attendance" | "honorarium";

const banglaDigits = (number: number) => String(number).replace(/[0-9]/g, digit => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
const days = {
  1: { label: "প্রথম দিন", date: "১৭ অক্টোবর ২০২৬", title: "Workshop on Agentic Architecture: Next-Gen Software Development" },
  2: { label: "দ্বিতীয় দিন", date: "১৮ অক্টোবর, ২০২৬", title: "Workshop on Agentic Systems in Action: Build, Evaluate, and Showcase" }
} as const;

function value(row: Registration, key: string) {
  return String(row[key] ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function department(row: Registration) {
  if (value(row, "department")) return value(row, "department");
  const source = row.source_data;
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const entry = Object.entries(source).find(([key]) => key.trim().toLowerCase() === "department");
  return String(entry?.[1] ?? "").trim();
}

function runs(content: string, size = 16, bold = false) {
  return (content || "-").match(/[\u0964-\u09ff]+|[^\u0964-\u09ff]+/g)!.map(part => {
    const bangla = /[\u0964-\u09ff]/.test(part);
    return new TextRun({
      text: bangla ? unicodeToBijoy(part) : part,
      font: bangla ? "SutonnyMJ" : "Arial",
      size, bold, color: "14263B",
      ...(bangla ? { language: { value: "bn-BD" } } : {})
    });
  });
}

function paragraph(content: string, size = 18, bold = false, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT, after = 90) {
  return new Paragraph({ children: runs(content, size, bold), alignment, spacing: { after } });
}

function cell(content: string, width: number, header = false, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: "DDF3F7" } : undefined,
    margins: { top: 95, bottom: 95, left: 75, right: 75 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: content ? runs(content, header ? 15 : 14, header) : [], alignment: align, spacing: { after: 0 } })]
  });
}

function venueInBangla(venue: string) {
  return /^Institute of Information Technology \(IIT\), University of Dhaka$/i.test(venue.trim())
    ? "ইনস্টিটিউট অব ইনফরমেশন টেকনোলজি (আইআইটি), ঢাকা বিশ্ববিদ্যালয়" : venue;
}

export async function buildRegistrationDocx(outsiders: Registration[], batch14: Registration[],
  group: ExportGroup, venue: string, day: WordDay, sheet: WordSheet): Promise<Buffer> {
  const dayInfo = days[day];
  const groupRows = [
    ...(group === "batch14" ? [] : outsiders),
    ...(group === "outsiders" ? [] : batch14)
  ];
  const rows = groupRows
    .filter(row => row.qr_status === "sent" && row.registration_status !== "rejected")
    .filter(row => value(row, "attendance") !== (day === 1 ? "Day 2 Only" : "Day 1 Only"))
    .sort((a, b) => value(b, "created_at").localeCompare(value(a, "created_at")));
  const widths = sheet === "attendance"
    ? [560, 2260, 2600, 1700, 1400, 2900, 2180]
    : [500, 1330, 1510, 1220, 1260, 1800, 2250, 780, 620, 860, 1470];
  const headings = sheet === "attendance"
    ? ["ক্রমিক নং", "নাম", "প্রতিষ্ঠান", "বিভাগ", "মোবাইল নম্বর", "ইমেইল", "স্বাক্ষর"]
    : ["ক্রমিক নং", "নাম", "প্রতিষ্ঠান", "বিভাগ", "মোবাইল নম্বর", "ইমেইল", "ব্যাংক অ্যাকাউন্ট", "সম্মানী গ্রস", "ট্যাক্স", "নেট সম্মানী", "স্বাক্ষর"];
  const tableRows = [new TableRow({ tableHeader: true, cantSplit: true,
    children: headings.map((heading, index) => cell(heading, widths[index], true, AlignmentType.CENTER)) })];
  rows.forEach((row, index) => {
    const common = [banglaDigits(index + 1), value(row, "full_name"), value(row, "institution"),
      department(row), value(row, "phone"), value(row, "email")];
    const bank = [value(row, "bank_name"), value(row, "bank_branch"), value(row, "bank_account_number")]
      .filter(Boolean).join("\n");
    const entries = sheet === "attendance" ? [...common, ""] :
      [...common, bank, "১,২০০", "২৮০", "৯২০", ""];
    tableRows.push(new TableRow({ cantSplit: true,
      children: entries.map((entry, column) => cell(entry.replaceAll("\n", ", "), widths[column], false,
        column === 0 || (sheet === "honorarium" && column >= 7 && column <= 9) ? AlignmentType.CENTER : AlignmentType.LEFT)) }));
  });
  if (!rows.length) tableRows.push(new TableRow({ children: [new TableCell({
    columnSpan: widths.length, children: [paragraph("এই দিনের জন্য কোনো কিউআর পাঠানো অংশগ্রহণকারী নেই।")]
  })] }));

  const logoDir = path.join(process.cwd(), "public", "partners");
  const [du, iit, icsetep, font] = await Promise.all([
    readFile(path.join(logoDir, "du.jpg")),
    readFile(path.join(logoDir, "du-iit.png")),
    readFile(path.join(logoDir, "icsetp.jpeg")),
    readFile(path.join(process.cwd(), "font", "SutonnyMJ Regular.ttf"))
  ]);
  const logoCell = (data: Buffer, type: "jpg" | "png", width: number, height: number) =>
    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data, type, transformation: { width, height } })] })] });
  const children: FileChild[] = [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
      logoCell(du, "jpg", 45, 57), logoCell(iit, "png", 96, 52), logoCell(icsetep, "jpg", 54, 54)
    ] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } } }),
    paragraph("প্রকল্প: আইসিএসইটিইপি", 21, true, AlignmentType.CENTER),
    paragraph("আইআইটি, ঢাকা বিশ্ববিদ্যালয়", 19, true, AlignmentType.CENTER, 180),
    paragraph(`কর্মশালার নাম: ${dayInfo.title}`, 21, true, AlignmentType.CENTER, 150),
    paragraph(`তারিখ: ${dayInfo.date}     স্থান: ${venueInBangla(venue)}`, 17, false, AlignmentType.CENTER, 170),
    paragraph(`${dayInfo.label} — ${sheet === "attendance" ? "হাজিরা শিট" : "সম্মানী শিট"}`, 23, true, AlignmentType.LEFT, 70),
    paragraph(`${group === "all" ? "উভয় নিবন্ধন দল" : group === "outsiders" ? "ওয়েবসাইট নিবন্ধন" : "বিএসএসই ১৪তম ব্যাচ"} · কিউআর পাঠানো অংশগ্রহণকারী: ${banglaDigits(rows.length)} জন`, 16, false, AlignmentType.LEFT, 150),
    new Table({ width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
      columnWidths: widths, layout: TableLayoutType.FIXED, rows: tableRows,
      borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "AFC6D1" } } }),
    paragraph(sheet === "attendance" ? "হাজিরা নিশ্চিত করতে স্বাক্ষর নিন।" : "সম্মানী গ্রহণের পর স্বাক্ষর নিন।", 15)
  ];
  const document = new Document({
    title: `${dayInfo.title} — ${sheet}`,
    creator: "Agentic AI Workshop Administration",
    fonts: [{ name: "SutonnyMJ", data: font }],
    sections: [{ properties: { page: { size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
      margin: { top: 560, right: 540, bottom: 560, left: 540 } } }, children }]
  });
  return Packer.toBuffer(document);
}
