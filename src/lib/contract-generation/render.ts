import { buildLeaseSections } from "./template";
import type { LeaseV1ViewModel } from "./view-model";

/** Browser-free, A4 lease/v1 renderer distilled from the supplied DOCX. */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 72; // one inch, matching the reference DOCX
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 68;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 10.5;
const BODY_LEADING = 13.4;

type Font = "regular" | "bold" | "italic";

interface PdfPage {
  commands: string[];
}

const LOWERCASE_WIDTHS: Record<string, number> = {
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
};

const UPPERCASE_WIDTHS: Record<string, number> = {
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
};

function normaliseText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ");
}

function pdfLiteral(value: string): string {
  let result = "";
  for (const character of normaliseText(value)) {
    const code = character.codePointAt(0) ?? 63;
    if (code > 255) {
      throw new Error(
        `lease/v1 PDF cannot encode character ${character} (U+${code.toString(16).toUpperCase()})`
      );
    }
    if (character === "\\" || character === "(" || character === ")") {
      result += `\\${character}`;
    } else if (code < 32 || code > 126) {
      result += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      result += character;
    }
  }
  return result;
}

function glyphWidth(character: string): number {
  if (character === " ") return 278;
  if (LOWERCASE_WIDTHS[character]) return LOWERCASE_WIDTHS[character];
  if (UPPERCASE_WIDTHS[character]) return UPPERCASE_WIDTHS[character];
  if (/\d/.test(character)) return 556;
  if (".,".includes(character)) return 278;
  if ("'`".includes(character)) return 191;
  if (":;!|".includes(character)) return 278;
  if ("-()[]".includes(character)) return 333;
  if ("/\\".includes(character)) return 278;
  if ("@%".includes(character)) return 889;
  if ("&£".includes(character)) return 667;
  return 556;
}

function textWidth(value: string, size: number): number {
  const width = [...normaliseText(value)].reduce(
    (total, character) => total + glyphWidth(character),
    0
  );
  return (width / 1000) * size;
}

function splitLongWord(word: string, size: number, maxWidth: number): string[] {
  if (textWidth(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && textWidth(candidate, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(value: string, size: number, maxWidth: number): string[] {
  const words = normaliseText(value)
    .trim()
    .split(/\s+/)
    .flatMap((word) => splitLongWord(word, size, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || textWidth(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function textCommand(
  value: string,
  x: number,
  y: number,
  size: number,
  font: Font,
  gray = 0
): string {
  const fontName = font === "bold" ? "F2" : font === "italic" ? "F3" : "F1";
  return `${gray} g BT /${fontName} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfLiteral(value)}) Tj ET 0 g`;
}

class LeaseLayout {
  readonly pages: PdfPage[] = [];
  private y = 0;

  constructor() {
    this.newPage();
  }

  private get page(): PdfPage {
    return this.pages[this.pages.length - 1];
  }

  private newPage() {
    this.pages.push({ commands: [] });
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN_BOTTOM) this.newPage();
  }

  private drawText(value: string, x: number, y: number, size: number, font: Font, gray = 0) {
    this.page.commands.push(textCommand(value, x, y, size, font, gray));
  }

  private centred(value: string, size: number, font: Font, after: number) {
    this.ensureSpace(size + after);
    const x = Math.max(MARGIN_X, (PAGE_WIDTH - textWidth(value, size)) / 2);
    this.drawText(value, x, this.y, size, font);
    this.y -= after;
  }

  opening(viewModel: LeaseV1ViewModel) {
    this.centred("ASSURED PERIODIC TENANCY AGREEMENT", 16, "bold", 23);
    this.centred("(Under the Renters' Rights Act 2025)", 12, "bold", 38);
    this.centred(
      `THIS AGREEMENT is made on ${viewModel.tenancy.startDateLong}`,
      11,
      "regular",
      30
    );
    this.centred("BETWEEN:", 11, "regular", 30);
    this.centred(viewModel.landlord.fullName, 13, "bold", 17);
    this.centred('(the "Landlord")', 11, "regular", 30);
    this.centred("AND", 11, "regular", 30);
    this.centred(viewModel.tenant.fullName, 13, "bold", 17);
    this.centred('(the "Tenant")', 11, "regular", 30);
    this.centred(
      '(individually the "Party" and collectively the "Parties")',
      11,
      "regular",
      36
    );
    this.paragraph(
      "IN CONSIDERATION OF the Landlord granting a tenancy of the premises to the Tenant, the Parties agree as follows:",
      { before: 0, after: 18 }
    );
    this.notice(
      "IMPORTANT NOTICE TO BOTH PARTIES",
      "This Agreement creates an Assured Periodic Tenancy (APT) under the Renters' Rights Act 2025 and the Housing Act 1988 (as amended). From 1 May 2026, Assured Shorthold Tenancies (ASTs) no longer exist in England. All residential tenancies in the private rented sector are now Assured Periodic Tenancies with no fixed end date. Section 21 'no-fault' eviction notices can no longer be served. The Landlord may only seek possession using grounds under Section 8 of the Housing Act 1988 (as amended by the Renters' Rights Act 2025)."
    );
  }

  notice(title: string, body: string) {
    const padding = 6;
    const titleLines = wrapText(title, 11, CONTENT_WIDTH - padding * 2);
    const bodyLines = wrapText(body, 9.8, CONTENT_WIDTH - padding * 2);
    const height = padding * 2 + titleLines.length * 13 + bodyLines.length * 12.2;
    this.ensureSpace(height + 14);
    const bottom = this.y - height;
    this.page.commands.push(
      `0 0.35 0.65 RG 0.8 w ${MARGIN_X.toFixed(2)} ${bottom.toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${height.toFixed(2)} re S 0 G`
    );
    let lineY = this.y - padding - 10;
    for (const line of titleLines) {
      this.drawText(line, MARGIN_X + padding, lineY, 11, "bold");
      lineY -= 13;
    }
    for (const line of bodyLines) {
      this.drawText(line, MARGIN_X + padding, lineY, 9.8, "regular");
      lineY -= 12.2;
    }
    this.y = bottom - 14;
  }

  heading(value: string) {
    this.ensureSpace(34);
    this.y -= 9;
    this.drawText(value.toUpperCase(), MARGIN_X, this.y, 12, "bold");
    this.y -= 19;
  }

  paragraph(
    value: string,
    opts: { before?: number; after?: number; size?: number; font?: Font; indent?: number } = {}
  ) {
    const before = opts.before ?? 3;
    const after = opts.after ?? 4;
    const size = opts.size ?? BODY_SIZE;
    const font = opts.font ?? "regular";
    const indent = opts.indent ?? 0;
    const leading = size === BODY_SIZE ? BODY_LEADING : size * 1.27;
    const lines = wrapText(value, size, CONTENT_WIDTH - indent);
    this.ensureSpace(before + Math.min(lines.length, 2) * leading);
    this.y -= before;
    for (const line of lines) {
      this.ensureSpace(leading);
      this.drawText(line, MARGIN_X + indent, this.y, size, font);
      this.y -= leading;
    }
    this.y -= after;
  }

  property(viewModel: LeaseV1ViewModel) {
    const address = viewModel.property.fullAddress;
    const lines = wrapText(address, 11, CONTENT_WIDTH - 24);
    this.ensureSpace(lines.length * 14 + 28);
    this.y -= 4;
    for (const line of lines) {
      const x = Math.max(MARGIN_X, (PAGE_WIDTH - textWidth(line, 11)) / 2);
      this.drawText(line, x, this.y, 11, "bold");
      this.y -= 14;
    }
    this.centred('(the "Property")', 11, "italic", 20);
  }

  list(items: string[]) {
    items.forEach((item, index) => {
      const marker = `${String.fromCharCode(97 + index)}.`;
      const markerWidth = 29;
      const lines = wrapText(item, BODY_SIZE, CONTENT_WIDTH - markerWidth - 16);
      this.ensureSpace(Math.min(lines.length, 2) * BODY_LEADING + 3);
      this.y -= 2;
      this.drawText(marker, MARGIN_X + 16, this.y, BODY_SIZE, "regular");
      for (const line of lines) {
        this.ensureSpace(BODY_LEADING);
        this.drawText(line, MARGIN_X + markerWidth + 16, this.y, BODY_SIZE, "regular");
        this.y -= BODY_LEADING;
      }
      this.y -= 2;
    });
    this.y -= 2;
  }

  execution(viewModel: LeaseV1ViewModel) {
    this.heading("Execution");
    this.paragraph(
      "IN WITNESS WHEREOF the Parties have duly executed this Agreement on the date first written above.",
      { before: 0, after: 14 }
    );
    this.signatureBlock("LANDLORD", viewModel.landlord.fullName);
    this.signatureBlock("TENANT", viewModel.tenant.fullName);

    this.ensureSpace(106);
    this.page.commands.push(
      `0.7 G 0.5 w ${MARGIN_X.toFixed(2)} ${this.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN_X).toFixed(2)} ${this.y.toFixed(2)} l S 0 G`
    );
    this.y -= 17;
    this.paragraph(
      "The Tenant acknowledges receiving a copy of this Agreement and the Government's Renters' Rights Act Information Sheet.",
      { before: 0, after: 15, size: 10, font: "italic" }
    );
    this.paragraph("Tenant Signature: ______________________________", {
      before: 0,
      after: 6,
    });
    this.paragraph("Date: ______________________________", { before: 0, after: 0 });
  }

  private signatureBlock(label: string, name: string) {
    this.ensureSpace(174);
    this.paragraph(`SIGNED by the ${label}:`, { before: 0, after: 18, font: "bold" });
    this.paragraph("Signature: ______________________________", { before: 0, after: 2 });
    this.paragraph(`Name: ${name}`, { before: 0, after: 2 });
    this.paragraph("Date: ______________________________", { before: 0, after: 15 });
    this.paragraph("Witness Signature: ______________________________", {
      before: 0,
      after: 2,
    });
    this.paragraph("Witness Name: ______________________________", { before: 0, after: 2 });
    this.paragraph("Witness Address: ______________________________", { before: 0, after: 15 });
  }

  addFooters() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const label = `Assured Periodic Tenancy Agreement   |   Page ${index + 1} of ${total}`;
      const x = (PAGE_WIDTH - textWidth(label, 9)) / 2;
      page.commands.push(textCommand(label, x, 35, 9, "regular", 0.45));
    });
  }
}

function buildPdf(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 7 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";
  objects[6] =
    "<< /Title (Assured Periodic Tenancy Agreement) /Producer (Property Manager direct PDF renderer) >>";

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = `${page.commands.join("\n")}\n`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`;
  });

  let pdf = "%PDF-1.4\n%PMGR\n";
  const offsets = new Array<number>(objects.length).fill(0);
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 6 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "ascii");
}

export function renderLeasePdf(viewModel: LeaseV1ViewModel): Buffer {
  const layout = new LeaseLayout();
  layout.opening(viewModel);
  for (const section of buildLeaseSections(viewModel)) {
    layout.heading(section.title);
    for (const item of section.items) {
      if (item.kind === "paragraph") layout.paragraph(item.text);
      else if (item.kind === "list") layout.list(item.items);
      else layout.property(viewModel);
    }
  }
  layout.execution(viewModel);
  layout.addFooters();
  return buildPdf(layout.pages);
}
