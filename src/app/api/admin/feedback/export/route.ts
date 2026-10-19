import { NextRequest, NextResponse } from "next/server";
import { adminUser } from "@/lib/supabase";
import { loadFeedbackResults } from "@/lib/feedback-results-server";
import { buildFeedbackPdf, type FeedbackExportScope } from "@/lib/feedback-pdf";

export const runtime = "nodejs";
const exportVersion = "standard-fonts-packaged-v1";

export async function GET(request: NextRequest) {
  if (!await adminUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "X-Feedback-PDF-Version": exportVersion } });
  const scope = request.nextUrl.searchParams.get("form") ?? "all";
  if (!["all", "workshop-1", "workshop-2"].includes(scope))
    return NextResponse.json({ error: "Choose a valid feedback report." }, { status: 400 });
  try {
    const results = await loadFeedbackResults();
    const pdf = await buildFeedbackPdf(results, scope as FeedbackExportScope);
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="workshop-feedback-${scope}.pdf"`,
      "Cache-Control": "private, no-store"
    } });
  } catch (error) {
    console.error("Feedback PDF export failed", error);
    const detail = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: `Unable to generate the feedback PDF: ${detail}` }, { status: 503 });
  }
}
