/**
 * Thin sendEmail() wrapper (notifications-scheduling skill). Provider:
 * Resend. With no RESEND_API_KEY the wrapper runs in DEV MOCK MODE — the
 * payload is logged instead of sent, so the whole pipeline is exercisable
 * offline (unattended-build constraint; see docs/PROGRESS.md).
 */

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  delivered: boolean;
  mode: "resend" | "mock";
  providerId?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Property Manager <notifications@example.com>";

  if (!apiKey) {
    console.log(
      `[email:mock] to=${payload.to} subject="${payload.subject}" html=${JSON.stringify(
        payload.html.slice(0, 200)
      )}…`
    );
    return { delivered: true, mode: "mock" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string };
  return { delivered: true, mode: "resend", providerId: data.id };
}

/** Shared minimal HTML shell for notification emails. */
export function renderEmail(opts: {
  title: string;
  body: string;
  linkPath?: string | null;
}): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = opts.linkPath ? `${appUrl}${opts.linkPath}` : appUrl;
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f5f5f5; padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e5e5e5;">
    <h2 style="margin:0 0 12px;font-size:18px;color:#171717;">${escapeHtml(opts.title)}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#404040;line-height:1.5;">${escapeHtml(opts.body)}</p>
    <a href="${link}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 16px;border-radius:6px;">Open dashboard</a>
    <p style="margin:20px 0 0;font-size:12px;color:#a3a3a3;">Property Management Dashboard</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
