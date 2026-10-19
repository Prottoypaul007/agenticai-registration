import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    outputFileTracingIncludes: {
      "/api/admin/export": ["./font/SutonnyMJ Regular.ttf"],
      // PDFKit loads these through dynamic package imports that Next's tracer cannot infer.
      "/api/admin/feedback/export": [
        "./node_modules/pdfkit/package.json",
        "./node_modules/pdfkit/js/pdfkit.node.mjs",
        "./node_modules/pdfkit/js/standard-fonts/**/*.cjs"
      ]
    }
  };
}
