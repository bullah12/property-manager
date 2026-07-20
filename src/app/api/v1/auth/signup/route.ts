import { z } from "zod";
import { conflict } from "@/lib/api/errors";
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
    console.warn("[auth.signup] Supabase rejected signup:", error.code);
    throw conflict("Unable to create account. Try signing in or use a different email.");
  }

  return ok(
    {
      signedUp: true,
      needsEmailConfirmation: data.session === null,
    },
    201
  );
});
