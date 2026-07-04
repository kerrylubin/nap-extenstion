import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any auth checks
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  const isPublic =
    pathname.startsWith("/api") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/reset-password") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Already logged in and hitting /login → redirect to dashboard
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Logged in but onboarding not done → redirect to /onboarding
  if (user && pathname !== "/onboarding" && !pathname.startsWith("/api") && !pathname.startsWith("/auth")) {
    const { data: profile } = await supabase.from("profiles").select("onboarding_complete").eq("id", user.id).single();
    if (profile && profile.onboarding_complete === false) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  // Onboarding already done → don't let them back to /onboarding
  if (user && pathname === "/onboarding") {
    const { data: profile } = await supabase.from("profiles").select("onboarding_complete").eq("id", user.id).single();
    if (profile?.onboarding_complete === true) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
