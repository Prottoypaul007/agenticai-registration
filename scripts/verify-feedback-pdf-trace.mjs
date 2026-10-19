import { readFileSync } from "node:fs";

const trace = JSON.parse(readFileSync(".next/server/app/api/admin/feedback/export/route.js.nft.json", "utf8"));
const files = trace.files.map(file => file.replaceAll("\\", "/"));
const required = [
  "node_modules/pdfkit/package.json",
  "node_modules/pdfkit/js/pdfkit.node.mjs",
  "node_modules/pdfkit/js/standard-fonts/Helvetica.cjs"
];
for (const path of required) {
  if (!files.some(file => file.endsWith(path)))
    throw new Error(`Feedback PDF export deployment is missing ${path}`);
}
if (!files.some(file => /node_modules\/pdfkit\/js\/standard-fonts\/chunks\/standardGlyphNames-.+\.cjs$/.test(file)))
  throw new Error("Feedback PDF export deployment is missing PDFKit standard glyph data");
console.log("Feedback PDF deployment assets verified.");
