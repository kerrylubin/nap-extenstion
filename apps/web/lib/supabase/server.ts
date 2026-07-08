import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function createClient(token?: string) {
  const cookieStore = await cookies();
  
  const options: any = {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server component — cookies can't be set during render, that's fine
        }
      },
    },
  };

  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    options
  );
}

/** Get the authenticated user or throw 401 — use in API routes */
export async function requireUser(req?: NextRequest) {
  const authHeader = req?.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  const supabase = await createClient(token);
  
  const { data: { user } } = token 
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}
