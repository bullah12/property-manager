import { z } from "zod";
import { ApiError, conflict } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});

export const POST = apiHandler(async (req) => {
  const { displayName, email, password } = await parseBody(req, signupSchema);
  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.APP_URL?.trim() || req.nextUrl.origin;
  const emailRedirectTo = new URL("/auth/confirm", appUrl).toString();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo,
    },
  });

  if (error) {
    console.warn("[auth.signup] Supabase rejected signup:", {
      name: error.name,
      code: error.code,
      status: error.status,
      message: error.message,
    });
    throw signupError(error.code, error.message);
  }

  return ok(
    {
      signedUp: true,
      needsEmailConfirmation: data.session === null,
    },
    201
  );
});

function signupError(code: string | undefined, providerMessage: string): ApiError {
  switch (code) {
    case "signup_disabled":
    case "email_provider_disabled":
      return conflict(
        "Email account creation is disabled in Supabase Authentication settings."
      );
    case "email_address_not_authorized":
      return conflict(
        "Supabase cannot send a confirmation email to this address. Configure custom SMTP or disable email confirmation."
      );
    case "weak_password":
      return conflict(providerMessage || "The password does not meet the required strength policy.");
    case "email_address_invalid":
      return conflict("Enter a deliverable email address that is not an example or test domain.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return new ApiError(
        "RATE_LIMITED",
        "Too many sign-up attempts or confirmation emails. Wait a few minutes and try again."
      );
    case "email_exists":
    case "user_already_exists":
      return conflict("Unable to create account. Try signing in or use a different email.");
    default:
      return conflict(
        code
          ? `Unable to create account (Supabase: ${code}).`
          : `Unable to create account (Supabase Auth: ${safeProviderMessage(providerMessage)}).`
      );
  }
}

function safeProviderMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim().slice(0, 240);
  return normalized || "unknown provider error";
}
