/**
 * Golden-file test (pdf-document-generation skill): render lease/v1 with
 * fixture data, print to PDF, extract the text layer and diff it against
 * tests/golden/lease-v1.txt — catches template/layout regressions.
 *
 * Run: npm run test:golden           (compares)
 *      npm run test:golden -- --update   (rewrites the golden file)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { printPdf, renderLeaseHtml } from "../src/lib/contract-generation/render";
import { leaseV1Schema } from "../src/lib/contract-generation/view-model";
import "dotenv/config";

const GOLDEN_PATH = path.join(process.cwd(), "tests", "golden", "lease-v1.txt");

/** Fixture view model — every merge field exercised, both clauses on. */
const fixture = leaseV1Schema.parse({
  landlord: { fullName: "Alex Landlord" },
  tenant: { fullName: "Priya Shah" },
  property: {
    addressLine1: "Flat 12, Harbour Quay, 3 Dockside Road",
    city: "Bristol",
    postcode: "BS1 4RT",
  },
  tenancy: {
    startDateLong: "1 August 2026",
    endDateLong: "31 July 2027",
    termMonthsWords: "twelve months",
    rentAmountLegal: "one thousand two hundred and fifty pounds (£1,250.00)",
    rentDueDayOrdinal: "5th",
    depositAmountLegal: "one thousand four hundred and forty-two pounds (£1,442.00)",
    depositSchemeName: "mydeposits (custodial)",
    depositReference: "MYD-88104",
  },
  clauses: {
    pets: true,
    petsDescription: "one small dog (terrier)",
    garden: true,
  },
});

/** Extract the PDF text layer with pdf-parse (pdf.js under the hood). */
async function extractText(pdf: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  const result = await parser.getText();
  await parser.destroy();
  // Normalise whitespace so trivial kerning differences don't fail the diff.
  return result.text
    .split("\n")
    .map((l: string) => l.replace(/\s+/g, " ").trim())
    .filter((l: string) => l.length > 0)
    .join("\n");
}

async function main() {
  const update = process.argv.includes("--update");
  const html = renderLeaseHtml(fixture);
  const pdf = await printPdf(html);
  const text = await extractText(pdf);

  if (update) {
    writeFileSync(GOLDEN_PATH, text + "\n");
    console.log(`Golden file updated: ${GOLDEN_PATH}`);
    return;
  }

  const golden = readFileSync(GOLDEN_PATH, "utf8").trimEnd();
  if (text.trimEnd() === golden) {
    console.log("PASS golden-lease: PDF text layer matches tests/golden/lease-v1.txt");
    return;
  }

  // Show a unified diff for debugging.
  const dir = mkdtempSync(path.join(os.tmpdir(), "golden-"));
  const actualPath = path.join(dir, "actual.txt");
  writeFileSync(actualPath, text + "\n");
  try {
    execFileSync("diff", ["-u", GOLDEN_PATH, actualPath], { stdio: "inherit" });
  } catch {
    // diff exits non-zero on difference — that's the point.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.error("FAIL golden-lease: PDF text layer diverged from the golden file");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
