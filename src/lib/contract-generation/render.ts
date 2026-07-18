import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { chromium } from "playwright-core";
import type { LeaseV1ViewModel } from "./view-model";

/**
 * §5.4 steps 4–5: Handlebars render → headless Chromium print-to-PDF.
 * A4 + margins come from the template's own @page rule. The template file is
 * the spec's example adopted verbatim (merge fields unchanged); version
 * bumps get a new directory (lease/v2/…) — v1 stays in the repo forever.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "templates", "documents");

const compiled = new Map<string, Handlebars.TemplateDelegate>();

function getTemplate(version: string): Handlebars.TemplateDelegate {
  let tpl = compiled.get(version);
  if (!tpl) {
    const file = path.join(TEMPLATE_DIR, version, "template.html");
    tpl = Handlebars.compile(readFileSync(file, "utf8"));
    compiled.set(version, tpl);
  }
  return tpl;
}

export function renderLeaseHtml(viewModel: LeaseV1ViewModel): string {
  const body = getTemplate("lease/v1")(viewModel);
  // The template is a fragment (style + content); wrap it in a document.
  // Fonts: the template's stack falls back to Georgia/serif, which Chromium
  // embeds as subsetted system fonts in the PDF.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tenancy agreement</title></head>
<body>${body}</body></html>`;
}

/** Resolve the pre-installed Chromium (remote env) or Playwright's own. */
export function resolveChromiumPath(): string | undefined {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    // e.g. /opt/pw-browsers/chromium-1194/chrome-linux/chrome
    for (const dir of readdirSync(base)) {
      if (dir.startsWith("chromium-")) {
        const candidate = path.join(base, dir, "chrome-linux", "chrome");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined; // let playwright-core resolve its default
}

/** On Vercel there's no pre-installed Chromium, so use @sparticuz/chromium's serverless binary. */
async function launchOptions() {
  if (process.env.VERCEL) {
    const sparticuzChromium = (await import("@sparticuz/chromium")).default;
    return {
      executablePath: await sparticuzChromium.executablePath(),
      args: sparticuzChromium.args,
    };
  }
  return {
    executablePath: resolveChromiumPath(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
}

export async function printPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch(await launchOptions());
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // A4 and margins come from the template's @page rule.
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
