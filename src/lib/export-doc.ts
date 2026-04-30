// Export utilities for AuraDocs documents (PDF + XLSX).
// PDF: render the .prose-aura element with html2canvas → embed in jsPDF.
// XLSX: parse Markdown tables into sheets; if none, build an outline from headings.

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

export async function exportToPDF(element: HTMLElement, fileName: string) {
  // Snapshot computed bg so the PDF inherits the deep-water theme.
  const bg = "#0a0f1c";
  const canvas = await html2canvas(element, {
    backgroundColor: bg,
    scale: 2,
    useCORS: true,
    windowWidth: element.scrollWidth,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const contentW = pageW - margin * 2;

  const imgW = contentW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let y = margin;
  let remaining = imgH;

  if (imgH <= pageH - margin * 2) {
    pdf.setFillColor(bg);
    pdf.rect(0, 0, pageW, pageH, "F");
    pdf.addImage(imgData, "JPEG", margin, y, imgW, imgH);
  } else {
    // Slice the long image across pages.
    const pageContentH = pageH - margin * 2;
    const sliceCanvasH = (pageContentH * canvas.width) / imgW;
    let srcY = 0;
    while (remaining > 0) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(sliceCanvasH, canvas.height - srcY);
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      const sliceImg = slice.toDataURL("image/jpeg", 0.92);
      const sliceH = (slice.height * imgW) / canvas.width;

      pdf.setFillColor(bg);
      pdf.rect(0, 0, pageW, pageH, "F");
      pdf.addImage(sliceImg, "JPEG", margin, margin, imgW, sliceH);

      srcY += slice.height;
      remaining -= sliceH;
      if (remaining > 0) pdf.addPage();
    }
  }

  pdf.save(`${safeName(fileName)}.pdf`);
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
    // Outline mode: H1/H2/H3 + paragraphs as a 2-column structured sheet.
    const outline = buildOutline(markdown);
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Section", "Content"],
      ...outline,
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Outline");
  }

  // Always include a metadata sheet
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
    if (headingMatch) {
      lastHeading = headingMatch[1].trim();
      i++;
      continue;
    }

    // A table = header row | divider row (---) | one or more body rows
    if (isTableRow(line) && i + 1 < lines.length && isDividerRow(lines[i + 1])) {
      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      tables.push({ caption: lastHeading, headers, rows });
      continue;
    }

    i++;
  }
  return tables;
}

function isTableRow(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isDividerRow(line: string) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /-/.test(line);
}
function parseRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

function buildOutline(md: string): string[][] {
  const out: string[][] = [];
  const lines = md.split("\n");
  let currentSection = "Document";
  let buf: string[] = [];

  const flush = () => {
    if (buf.length) {
      out.push([currentSection, buf.join("\n").trim()]);
      buf = [];
    }
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      flush();
      currentSection = `${"  ".repeat(h[1].length - 1)}${h[2].trim()}`;
      continue;
    }
    if (line.trim()) buf.push(line);
  }
  flush();
  return out;
}

function sheetName(raw: string, idx: number): string {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  const cleaned = raw.replace(/[:\\/?*[\]]/g, "").trim().slice(0, 28) || `Sheet ${idx + 1}`;
  return `${idx + 1}. ${cleaned}`.slice(0, 31);
}

function safeName(s: string) {
  return (s || "auradocs").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "auradocs";
}
