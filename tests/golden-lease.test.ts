/**
 * Golden-file test: render lease/v2 with
 * fixture data, write a PDF, extract the text layer and diff it against
 * tests/golden/lease-v2.txt — catches template/layout regressions.
 *
 * Run: npm run test:golden           (compares)
 *      npm run test:golden -- --update   (rewrites the golden file)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGeneratedLeaseFilename } from "../src/lib/contract-generation/filename";
import { renderLeasePdf } from "../src/lib/contract-generation/render";
import { buildLeaseViewModel } from "../src/lib/contract-generation/view-model";
import "dotenv/config";

const GOLDEN_PATH = path.join(process.cwd(), "tests", "golden", "lease-v2.txt");

/** Fixture view model — proves the supplied property landlord drives the document. */
const fixture = buildLeaseViewModel({
  landlord: {
    fullName: "Zulfiqar Ali Taj",
    address: "25 Aiskew Grove, Stockton-on-Tees TS19 7QS, UK",
    phone: "07847 617821",
    email: "taj.zulfiqar@gmail.com",
  },
  tenant: {
    id: "00000000-0000-0000-0000-000000000002",
    fullName: "Noreen Akhtar",
    phone: "07933 651414",
    email: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  property: {
    id: "00000000-0000-0000-0000-000000000001",
    nickname: "Alum Rock Road",
    addressLine1: "322 Alum Rock Rd",
    addressLine2: "Alum Rock",
    city: "Birmingham",
    postcode: "B8 3DD",
    propertyType: "house",
    bedrooms: 3,
    purchasePriceCents: null,
    landlordName: "Zulfiqar Ali Taj",
    landlordAddress: "25 Aiskew Grove, Stockton-on-Tees TS19 7QS, UK",
    landlordPhone: "07847 617821",
    landlordEmail: "taj.zulfiqar@gmail.com",
    notes: null,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  tenancy: {
    id: "00000000-0000-0000-0000-000000000003",
    propertyId: "00000000-0000-0000-0000-000000000001",
    tenantId: "00000000-0000-0000-0000-000000000002",
    startDate: new Date("2026-07-01T00:00:00Z"),
    endDate: null,
    endedOn: null,
    rentAmountCents: 105000,
    rentDueDay: 1,
    depositAmountCents: 105000,
    depositScheme: "mydeposits",
    depositReference: "MYD-88104",
    status: "draft",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  clauses: {
    pets: true,
    petsDescription: "one small dog",
    garden: true,
    gasSafetyApplies: true,
    billsIncluded: true,
    billsDescription: "water and council tax",
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
    .filter(
      (l: string) =>
        l.length > 0 &&
        !/^-- \d+ of \d+ --$/.test(l) &&
        !/^Page \d+ of \d+$/.test(l) &&
        !/^Assured Periodic Tenancy Agreement \| Page \d+ of \d+$/.test(l)
    )
    .join("\n");
}

async function main() {
  const update = process.argv.includes("--update");
  const pdf = renderLeasePdf(fixture);
  if (process.argv.includes("--render")) {
    const renderDir = path.join(process.cwd(), "tmp", "pdfs");
    mkdirSync(renderDir, { recursive: true });
    const renderPath = path.join(renderDir, "lease-v2-sample.pdf");
    writeFileSync(renderPath, pdf);
    console.log(`Rendered PDF fixture: ${renderPath}`);
  }
  const text = await extractText(pdf);
  const filename = buildGeneratedLeaseFilename(fixture);
  if (
    filename !==
    "Tenancy_Agreement_Zulfiqar-Ali-Taj_Noreen-Akhtar_2026-07-01.pdf"
  ) {
    throw new Error(`Unexpected generated filename: ${filename}`);
  }

  if (update) {
    writeFileSync(GOLDEN_PATH, text + "\n");
    console.log(`Golden file updated: ${GOLDEN_PATH}`);
    return;
  }

  const golden = readFileSync(GOLDEN_PATH, "utf8").trimEnd();
  if (text.trimEnd() === golden) {
    console.log("PASS golden-lease: PDF text layer matches tests/golden/lease-v2.txt");
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
  console.error("FAIL golden-lease: PDF text layer diverged from the lease/v2 golden file");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
