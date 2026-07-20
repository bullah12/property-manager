import { z } from "zod";
import { ApiError, conflict } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { prisma } from "@/lib/db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signupSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});

export const POST = apiHandler(async (req) => {
  const { displayName, email, password } = await parseBody(req, signupSchema);
  if (await accountExists(email)) {
    throw conflict("An account with this email already exists. Sign in instead.");
  }

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
    throw signupError(error.code, error.message, error.name, error.status);
  }

  return ok(
    {
      signedUp: true,
      needsEmailConfirmation: data.session === null,
    },
    201
  );
});

async function accountExists(email: string): Promise<boolean> {
  const appUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (appUser) return true;

  // Supabase deliberately obscures duplicate signups when email confirmation
  // is enabled. The server-only Admin API lets this owner-facing app provide
  // the explicit duplicate-account message requested by the product.
  const admin = createSupabaseAdminClient();
  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[auth.signup] Unable to check existing Auth users:", {
        name: error.name,
        code: error.code,
        status: error.status,
        message: error.message,
      });
      // Do not turn a diagnostic lookup failure into an outage; signUp still
      // performs Supabase's own duplicate handling.
      return false;
    }
    if (data.users.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
      return true;
    }
    if (data.users.length < perPage) return false;
  }
  return false;
}

function signupError(
  code: string | undefined,
  providerMessage: string,
  errorName: string,
  status: number | undefined
): ApiError {
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
      return conflict("An account with this email already exists. Sign in instead.");
    default:
      if (status && status >= 500) {
        return new ApiError(
          "INTERNAL",
          "Supabase Auth could not complete account creation. Check the Supabase Auth logs and SMTP configuration, then try again."
        );
      }
      return conflict(
        code
          ? `Unable to create account (Supabase: ${code}).`
          : `Unable to create account (Supabase Auth ${errorName}: ${safeProviderMessage(providerMessage)}).`
      );
  }
}

function safeProviderMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim().slice(0, 240);
  return normalized || "unknown provider error";
}
