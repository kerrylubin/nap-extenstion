import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies can't be set during render, that's fine
          }
        },
      },
    }
  );
}

/** Get the authenticated user or throw 401 — use in API routes */
export async function requireUser(req?: NextRequest) {
  const supabase = await createClient();
  
  const authHeader = req?.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  const { data: { user } } = token 
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}
