import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "signup",
  "invite",
  "recovery",
  "email_change",
]);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const rawType = req.nextUrl.searchParams.get("type");
  let error: { message: string } | null = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && rawType && OTP_TYPES.has(rawType as EmailOtpType)) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    }));
  } else {
    error = { message: "Missing confirmation token" };
  }

  const destination = req.nextUrl.clone();
  destination.pathname = error ? "/login" : "/";
  destination.search = error ? "?confirmation=failed" : "";
  return NextResponse.redirect(destination);
}
