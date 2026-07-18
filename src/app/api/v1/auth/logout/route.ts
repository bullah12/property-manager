import { apiHandler } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const POST = apiHandler(async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return ok({ loggedOut: true });
});
