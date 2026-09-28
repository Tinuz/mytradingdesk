import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        for (const cookie of cookies)
          request.cookies.set(cookie.name, cookie.value);
        response = NextResponse.next({ request });
        for (const cookie of cookies)
          response.cookies.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = {
  matcher: [
    "/today/:path*",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/assets/:path*",
    "/indicators/:path*",
    "/research/:path*",
    "/history/:path*",
    "/allocation/:path*",
    "/portfolio/:path*",
    "/paper/:path*",
    "/reviews/:path*",
    "/workbench/:path*",
    "/journal/:path*",
    "/mandate/:path*",
    "/validation/:path*",
    "/notifications/:path*",
    "/governance/:path*",
    "/universe/:path*",
  ],
};
