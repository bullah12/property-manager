import { z } from "zod";
import { unauthenticated } from "@/lib/api/errors";
import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { parseBody } from "@/lib/api/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export const POST = apiHandler(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Identical error for wrong password and unknown account (auth skill).
    throw unauthenticated("Invalid email or password");
  }
  return ok({ loggedIn: true });
});
