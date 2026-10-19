import { gunzipSync } from "node:zlib";
import PDFDocument from "pdfkit";
import { formDetails, type FormKey } from "@/lib/feedback";
import type { summarizeFeedback } from "@/lib/feedback-results";
import { HIND_FONT_GZIP_BASE64 } from "@/lib/feedback-pdf-font";

export type FeedbackExportScope = FormKey | "all";
type Results = ReturnType<typeof summarizeFeedback>;
type Count = { label: string; count: number };

const ink = "#13253A";
const muted = "#53647A";
const accent = "#007B91";
const line = "#D7E4EA";
const left = 48;
const right = 547;
const width = right - left;

export async function buildFeedbackPdf(results: Results, scope: FeedbackExportScope): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 20, left, right: 48 }, bufferPages: true, autoFirstPage: false });
  doc.registerFont("Report", gunzipSync(Buffer.from(HIND_FONT_GZIP_BASE64, "base64")));
  const chunks: Buffer[] = [];
  let activeTitle = "";
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  function ensure(height: number) {
    if (doc.y + height > doc.page.height - 58) {
      doc.addPage();
      doc.font("Report").fontSize(9).fillColor(accent).text(`${activeTitle} - continued`, left, 49, { width });
      doc.moveTo(left, doc.y + 5).lineTo(right, doc.y + 5).strokeColor(line).lineWidth(0.6).stroke();
      doc.y += 15;
    }
  }
  function heading(title: string) {
    ensure(39);
    doc.moveDown(0.7).font("Report").fontSize(13).fillColor(ink).text(title, left, doc.y, { width });
    doc.moveDown(0.4);
  }
  function distribution(title: string, items: Count[], denominator: number) {
    ensure(85);
    heading(title);
    ensure(27);
    const headY = doc.y;
    doc.rect(left, headY, width, 23).fill("#EAF4F6");
    doc.fillColor(ink).fontSize(9).text("Response", left + 10, headY + 5, { width: 337 });
    doc.text("Count", left + 359, headY + 5, { width: 55, align: "right" });
    doc.text("Share", left + 426, headY + 5, { width: 63, align: "right" });
    doc.y = headY + 23;
    for (const item of items) {
      const textHeight = doc.heightOfString(item.label, { width: 335, lineGap: 1 });
      const rowHeight = Math.max(23, textHeight + 10);
      ensure(rowHeight);
      const y = doc.y;
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).strokeColor(line).lineWidth(0.6).stroke();
      doc.fillColor(ink).text(item.label, left + 10, y + 5, { width: 335, lineGap: 1 });
      doc.text(String(item.count), left + 359, y + 5, { width: 55, align: "right" });
      doc.fillColor(muted).text(denominator ? `${Math.round(item.count / denominator * 100)}%` : "0%", left + 426, y + 5, { width: 63, align: "right" });
      doc.y = y + rowHeight;
    }
    doc.moveDown(0.5);
  }
  function comments(title: string, values: string[]) {
    heading(`${title} (${values.length})`);
    if (!values.length) {
      doc.fontSize(9).fillColor(muted).text("No written suggestions.", left, doc.y, { width });
      return;
    }
    for (const [index, value] of values.entries()) {
      doc.fontSize(9);
      const comment = value.trim();
      const height = doc.heightOfString(comment, { width: width - 43, lineGap: 2 }) + 17;
      ensure(Math.min(height, doc.page.height - 110));
      const y = doc.y;
      doc.fillColor(accent).text(`${index + 1}.`, left + 4, y + 5, { width: 28 });
      doc.fillColor(ink).text(comment, left + 37, y + 5, { width: width - 43, lineGap: 2 });
      doc.y = Math.max(y + height, doc.y + 7);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(line).lineWidth(0.5).stroke();
      doc.y += 3;
    }
  }

  const keys: FormKey[] = scope === "all" ? ["workshop-1", "workshop-2"] : [scope];
  keys.forEach(key => {
    doc.addPage();
    activeTitle = formDetails[key].title;
    const result = results[key];
    doc.font("Report").fillColor(accent).fontSize(10).text("WORKSHOP FEEDBACK REPORT", left, 48, { width });
    doc.moveDown(0.65).fontSize(17).fillColor(ink).text(formDetails[key].title, left, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.4).fontSize(9).fillColor(muted).text(`${formDetails[key].date}  |  Anonymous responses: ${result.total}`, left, doc.y, { width });
    doc.moveDown(0.3).text(`Generated: ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date())} (Bangladesh time)`, left, doc.y, { width });
    doc.moveDown(0.8);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(accent).lineWidth(1.5).stroke();
    doc.y += 8;
    if (result.specificAnswers < result.total) {
      doc.fontSize(9).fillColor(muted).text(`Day-specific questions: ${result.specificAnswers} responses. Earlier answers remain in the other totals.`, left, doc.y, { width });
    }
    distribution(key === "workshop-1" ? "Helpfulness: fundamentals and architecture" : "Helpfulness: building, evaluation, and showcasing", result.helpfulness, result.total);
    distribution(key === "workshop-1" ? "Confidence: sketching an agentic architecture" : "Confidence: building and evaluating an agent", result.confidence, result.specificAnswers);
    distribution(key === "workshop-1" ? "Architecture topics needing explanation" : "Hands-on steps needing practice", result.focusAreas, result.specificAnswers);
    distribution("Interest in future workshops", result.futureWorkshops, result.total);
    distribution(`Undergraduate course support (${result.course.supportPercent}% Yes)`, result.course.support, result.total);
    const supportCount = result.course.support.find(item => item.label === "Yes")?.count ?? 0;
    distribution("Preferred academic year among course supporters", result.course.academicYears, supportCount);
    comments("Workshop improvement suggestions", result.improvements);
    comments("Suggested undergraduate course topics and activities", result.course.suggestions);
    const oldCount = results.historical[key];
    if (oldCount) {
      ensure(45);
      doc.moveDown(0.5).fontSize(8).fillColor(muted).text(`${oldCount} earlier questionnaire responses are stored separately and excluded from this report.`, left, doc.y, { width });
    }
  });
  const pages = doc.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) {
    doc.switchToPage(page);
    doc.moveTo(left, doc.page.height - 40).lineTo(right, doc.page.height - 40).strokeColor(line).lineWidth(0.6).stroke();
    doc.font("Report").fontSize(8).fillColor(muted).text("Anonymous workshop feedback", left, doc.page.height - 34, { width: 340 });
    doc.text(`Page ${page + 1} of ${pages.count}`, right - 100, doc.page.height - 34, { width: 100, align: "right" });
  }
  doc.end();
  return finished;
}
