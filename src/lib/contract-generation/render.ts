import type { LeaseV1ViewModel } from "./view-model";

/**
 * Browser-free lease/v1 PDF renderer.
 *
 * It writes a small standards-compliant PDF directly, using PDF's built-in
 * Times fonts. That keeps contract generation deterministic and removes the
 * Chromium/Playwright runtime requirement from serverless deployments.
 */

const PAGE_WIDTH = 595.28; // A4 points
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56.69; // 20 mm
const MARGIN_TOP = 70.87; // 25 mm
const MARGIN_BOTTOM = 70.87;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 11;
const BODY_LEADING = 16.5;

type Font = "regular" | "bold";

interface PdfPage {
  commands: string[];
}

const LOWERCASE_WIDTHS: Record<string, number> = {
  a: 444,
  b: 500,
  c: 444,
  d: 500,
  e: 444,
  f: 333,
  g: 500,
  h: 500,
  i: 278,
  j: 278,
  k: 500,
  l: 278,
  m: 778,
  n: 500,
  o: 500,
  p: 500,
  q: 500,
  r: 333,
  s: 389,
  t: 278,
  u: 500,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
};

const UPPERCASE_WIDTHS: Record<string, number> = {
  A: 722,
  B: 667,
  C: 667,
  D: 722,
  E: 611,
  F: 556,
  G: 722,
  H: 722,
  I: 333,
  J: 389,
  K: 722,
  L: 611,
  M: 889,
  N: 722,
  O: 722,
  P: 556,
  Q: 722,
  R: 667,
  S: 556,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
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

/** Encode a WinAnsi PDF literal string without introducing binary streams. */
function pdfLiteral(value: string): string {
  let result = "";
  for (const character of normaliseText(value)) {
    const code = character.codePointAt(0) ?? 63;
    if (code > 255) {
      throw new Error(
        `lease/v1 PDF cannot encode character ${character} (U+${code.toString(16).toUpperCase()})`
      );
    } else if (character === "\\" || character === "(" || character === ")") {
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
  if (character === " ") return 250;
  if (LOWERCASE_WIDTHS[character]) return LOWERCASE_WIDTHS[character];
  if (UPPERCASE_WIDTHS[character]) return UPPERCASE_WIDTHS[character];
  if (/\d/.test(character)) return 500;
  if (".,'`".includes(character)) return 250;
  if (":;!|".includes(character)) return 278;
  if ("-()[]".includes(character)) return 333;
  if ("/\\".includes(character)) return 278;
  if ("@%&".includes(character)) return 778;
  if (character === "£") return 500;
  return 500;
}

function textWidth(value: string, size: number, font: Font): number {
  const width = [...normaliseText(value)].reduce(
    (total, character) => total + glyphWidth(character),
    0
  );
  return (width / 1000) * size * (font === "bold" ? 1.035 : 1);
}

function wrapText(value: string, size: number, maxWidth: number, font: Font): string[] {
  const words = normaliseText(value)
    .trim()
    .split(/\s+/)
    .flatMap((word) => {
      if (textWidth(word, size, font) <= maxWidth) return [word];

      const chunks: string[] = [];
      let chunk = "";
      for (const character of word) {
        const candidate = `${chunk}${character}`;
        if (chunk && textWidth(candidate, size, font) > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else {
          chunk = candidate;
        }
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || textWidth(candidate, size, font) <= maxWidth) {
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
  const fontName = font === "bold" ? "F2" : "F1";
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

  title(value: string) {
    this.ensureSpace(40);
    const size = 16;
    const x = Math.max(MARGIN_X, (PAGE_WIDTH - textWidth(value, size, "bold")) / 2);
    this.drawText(value, x, this.y, size, "bold");
    this.y -= 36;
  }

  party(label: string, value: string) {
    const labelWidth = 78;
    const lines = wrapText(value, BODY_SIZE, CONTENT_WIDTH - labelWidth, "regular");
    this.ensureSpace(lines.length * BODY_LEADING);
    this.drawText(`${label}:`, MARGIN_X, this.y, BODY_SIZE, "bold");
    lines.forEach((line, index) => {
      this.drawText(
        line,
        MARGIN_X + labelWidth,
        this.y - index * BODY_LEADING,
        BODY_SIZE,
        "regular"
      );
    });
    this.y -= lines.length * BODY_LEADING;
  }

  partyRule() {
    this.y -= 4;
    this.page.commands.push(
      `0.65 g 0.5 w ${MARGIN_X.toFixed(2)} ${this.y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN_X).toFixed(2)} ${this.y.toFixed(2)} l S 0 g`
    );
    this.y -= 18;
  }

  section(title: string, body: string) {
    const lines = wrapText(body, BODY_SIZE, CONTENT_WIDTH, "regular");
    this.ensureSpace(22 + BODY_LEADING);
    this.drawText(title, MARGIN_X, this.y, 12, "bold");
    this.y -= 21;
    for (const line of lines) {
      this.ensureSpace(BODY_LEADING);
      this.drawText(line, MARGIN_X, this.y, BODY_SIZE, "regular");
      this.y -= BODY_LEADING;
    }
    this.y -= 10;
  }

  signature(label: string) {
    this.ensureSpace(92);
    this.y -= 6;
    this.drawText(`Signed by the ${label}:`, MARGIN_X, this.y, BODY_SIZE, "regular");
    this.y -= 24;
    this.page.commands.push(
      `0 g 0.7 w ${MARGIN_X.toFixed(2)} ${this.y.toFixed(2)} m ${(MARGIN_X + 300).toFixed(2)} ${this.y.toFixed(2)} l S`
    );
    this.y -= 20;
    this.drawText("Date:", MARGIN_X, this.y, BODY_SIZE, "regular");
    this.page.commands.push(
      `0 g 0.7 w ${(MARGIN_X + 36).toFixed(2)} ${(this.y - 2).toFixed(2)} m ${(MARGIN_X + 190).toFixed(2)} ${(this.y - 2).toFixed(2)} l S`
    );
    this.y -= 28;
  }

  addPageNumbers() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      const label = `Page ${index + 1} of ${total}`;
      const x = (PAGE_WIDTH - textWidth(label, 8, "regular")) / 2;
      page.commands.push(textCommand(label, x, 35, 8, "regular", 0.45));
    });
  }
}

function buildPdf(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 6 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] =
    "<< /Title (Assured Shorthold Tenancy Agreement) /Producer (Property Manager direct PDF renderer) >>";

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = `${page.commands.join("\n")}\n`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`;
  });

  let pdf = "%PDF-1.4\n%PMGR\n";
  const offsets = new Array<number>(objects.length).fill(0);
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "ascii");
}

export function renderLeasePdf(viewModel: LeaseV1ViewModel): Buffer {
  const layout = new LeaseLayout();
  layout.title("ASSURED SHORTHOLD TENANCY AGREEMENT");
  layout.party("Landlord", viewModel.landlord.fullName);
  layout.party("Tenant", viewModel.tenant.fullName);
  layout.party(
    "Property",
    `${viewModel.property.addressLine1}, ${viewModel.property.city}, ${viewModel.property.postcode}`
  );
  layout.partyRule();

  layout.section(
    "1. Term",
    `The tenancy begins on ${viewModel.tenancy.startDateLong} and ends on ${viewModel.tenancy.endDateLong}, being a fixed term of ${viewModel.tenancy.termMonthsWords}.`
  );
  layout.section(
    "2. Rent",
    `The rent is ${viewModel.tenancy.rentAmountLegal} per calendar month, payable in advance on the ${viewModel.tenancy.rentDueDayOrdinal} day of each month.`
  );
  layout.section(
    "3. Deposit",
    `A deposit of ${viewModel.tenancy.depositAmountLegal} is held under the ${viewModel.tenancy.depositSchemeName} scheme (reference ${viewModel.tenancy.depositReference}).`
  );

  let nextSection = 4;
  if (viewModel.clauses.pets) {
    layout.section(
      `${nextSection}. Pets`,
      `The Tenant may keep the following pet(s) at the Property: ${viewModel.clauses.petsDescription}.`
    );
    nextSection += 1;
  }
  if (viewModel.clauses.garden) {
    layout.section(
      `${nextSection}. Garden`,
      "The Tenant shall keep the garden in a tidy condition."
    );
  }

  layout.signature("Landlord");
  layout.signature("Tenant");
  layout.addPageNumbers();
  return buildPdf(layout.pages);
}
