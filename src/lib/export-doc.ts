// Export utilities for AuraDocs documents (PDF + XLSX).
// PDF: render markdown into an offscreen container themed with sRGB-safe
// colors (html2canvas does NOT support oklch()), then snapshot → jsPDF.
// XLSX: parse Markdown tables; if none, build an outline from headings.

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { marked } from "marked";

// AuraDocs theme — sRGB equivalents of our oklch tokens (html2canvas-safe).
const THEME = {
  bg: "#0a0f1c",
  panel: "#0f1729",
  text: "#dfe6f1",
  muted: "#94a3b8",
  heading: "#f1f5f9",
  primary: "#22d3ee",   // aura-cyan
  accent: "#a855f7",    // aura-violet
  border: "rgba(255,255,255,0.08)",
  codeBg: "#070b15",
};

function buildPrintableHTML(markdownHtml: string, title: string) {
  return `
    <div id="aura-print-root" style="
      width: 794px;
      padding: 56px 64px;
      background: ${THEME.bg};
      color: ${THEME.text};
      font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      box-sizing: border-box;
    ">
      <div style="
        display:flex;align-items:center;gap:10px;margin-bottom:32px;
        padding-bottom:16px;border-bottom:1px solid ${THEME.border};
      ">
        <div style="
          width:22px;height:22px;border-radius:50%;
          background:linear-gradient(135deg, ${THEME.accent}, ${THEME.primary});
          box-shadow:0 0 16px ${THEME.primary}66;
        "></div>
        <span style="font-weight:600;letter-spacing:-0.01em;color:${THEME.heading};font-size:15px;">AuraDocs</span>
        <span style="margin-left:auto;color:${THEME.muted};font-size:11px;font-family:'JetBrains Mono',ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.1em;">
          ${new Date().toLocaleDateString()}
        </span>
      </div>
      <h1 style="font-size:28px;font-weight:600;color:${THEME.heading};margin:0 0 24px;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
      <div class="aura-md">${markdownHtml}</div>
    </div>
    <style>
      .aura-md h1 { font-size:24px;font-weight:600;color:${THEME.heading};margin:24px 0 12px;letter-spacing:-0.02em; }
      .aura-md h2 { font-size:18px;font-weight:600;color:${THEME.heading};margin:24px 0 10px;letter-spacing:-0.01em; }
      .aura-md h3 { font-size:15px;font-weight:600;color:${THEME.heading};margin:18px 0 8px; }
      .aura-md p  { margin:10px 0;color:${THEME.text}; }
      .aura-md ul, .aura-md ol { margin:10px 0;padding-left:24px;color:${THEME.text}; }
      .aura-md li { margin:4px 0; }
      .aura-md strong { color:${THEME.heading};font-weight:600; }
      .aura-md a { color:${THEME.primary};text-decoration:underline; }
      .aura-md code {
        font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.85em;
        background:rgba(34,211,238,0.12);color:${THEME.primary};
        padding:2px 6px;border-radius:4px;
      }
      .aura-md pre {
        background:${THEME.codeBg};border:1px solid ${THEME.border};border-radius:8px;
        padding:14px;overflow:hidden;margin:14px 0;
        font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;line-height:1.6;
        white-space:pre-wrap;word-break:break-word;
      }
      .aura-md pre code { background:transparent;padding:0;color:${THEME.text}; }
      .aura-md blockquote {
        border-left:3px solid ${THEME.accent};padding:4px 0 4px 14px;margin:14px 0;
        color:${THEME.muted};font-style:italic;
      }
      .aura-md table { width:100%;border-collapse:collapse;margin:14px 0;font-size:13px; }
      .aura-md th {
        text-align:left;padding:8px 10px;border-bottom:1px solid ${THEME.border};
        color:${THEME.muted};font-weight:500;
        font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;
        text-transform:uppercase;letter-spacing:0.05em;background:rgba(255,255,255,0.02);
      }
      .aura-md td { padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.04);color:${THEME.text}; }
      .aura-md hr { border:none;border-top:1px solid ${THEME.border};margin:24px 0; }
    </style>
  `;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

export async function exportToPDF(_element: HTMLElement, fileName: string, markdown?: string, titleText?: string) {
  // We deliberately ignore the live element (it uses oklch() colors) and
  // re-render the markdown into a sRGB-safe container offscreen.
  const md = markdown ?? _element.innerText ?? "";
  const html = marked.parse(md, { gfm: true, breaks: false, async: false }) as string;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;";
  host.innerHTML = buildPrintableHTML(html, titleText || fileName);
  document.body.appendChild(host);
  const root = host.querySelector("#aura-print-root") as HTMLElement;

  try {
    // Wait one frame so layout settles.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const canvas = await html2canvas(root, {
      backgroundColor: THEME.bg,
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: root.scrollWidth,
      windowHeight: root.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pageH) {
      pdf.setFillColor(THEME.bg);
      pdf.rect(0, 0, pageW, pageH, "F");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgW, imgH);
    } else {
      // Slice the tall canvas across multiple A4 pages.
      const sliceCanvasH = (pageH * canvas.width) / imgW;
      let srcY = 0;
      while (srcY < canvas.height) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(sliceCanvasH, canvas.height - srcY);
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        const sliceH = (slice.height * imgW) / canvas.width;

        pdf.setFillColor(THEME.bg);
        pdf.rect(0, 0, pageW, pageH, "F");
        pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgW, sliceH);

        srcY += slice.height;
        if (srcY < canvas.height) pdf.addPage();
      }
    }

    pdf.save(`${safeName(fileName)}.pdf`);
  } finally {
    host.remove();
  }
}

interface MarkdownTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

export function exportToXLSX(markdown: string, title: string, fileName: string) {
  const wb = XLSX.utils.book_new();
  const tables = extractMarkdownTables(markdown);

  if (tables.length > 0) {
    tables.forEach((tbl, i) => {
      const sheet = XLSX.utils.aoa_to_sheet([tbl.headers, ...tbl.rows]);
      XLSX.utils.book_append_sheet(wb, sheet, sheetName(tbl.caption, i));
    });
  } else {
    const outline = buildOutline(markdown);
    const sheet = XLSX.utils.aoa_to_sheet([["Section", "Content"], ...outline]);
    XLSX.utils.book_append_sheet(wb, sheet, "Outline");
  }

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ["AuraDocs Export"],
    ["Title", title],
    ["Generated at", new Date().toISOString()],
    ["Tables found", String(tables.length)],
    ["Character count", String(markdown.length)],
  ]);
  XLSX.utils.book_append_sheet(wb, metaSheet, "Metadata");

  XLSX.writeFile(wb, `${safeName(fileName)}.xlsx`);
}

function extractMarkdownTables(md: string): MarkdownTable[] {
  const lines = md.split("\n");
  const tables: MarkdownTable[] = [];
  let lastHeading = "Table";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) { lastHeading = headingMatch[1].trim(); i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isDividerRow(lines[i + 1])) {
      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(parseRow(lines[i])); i++; }
      tables.push({ caption: lastHeading, headers, rows });
      continue;
    }
    i++;
  }
  return tables;
}
function isTableRow(line: string) { return /^\s*\|.*\|\s*$/.test(line); }
function isDividerRow(line: string) { return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /-/.test(line); }
function parseRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}
function buildOutline(md: string): string[][] {
  const out: string[][] = [];
  const lines = md.split("\n");
  let currentSection = "Document";
  let buf: string[] = [];
  const flush = () => { if (buf.length) { out.push([currentSection, buf.join("\n").trim()]); buf = []; } };
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) { flush(); currentSection = `${"  ".repeat(h[1].length - 1)}${h[2].trim()}`; continue; }
    if (line.trim()) buf.push(line);
  }
  flush();
  return out;
}
function sheetName(raw: string, idx: number): string {
  const cleaned = raw.replace(/[:\\/?*[\]]/g, "").trim().slice(0, 28) || `Sheet ${idx + 1}`;
  return `${idx + 1}. ${cleaned}`.slice(0, 31);
}
function safeName(s: string) {
  return (s || "auradocs").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "auradocs";
}
