import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Authenticatie is niet geconfigureerd." },
      { status: 503 },
    );
  }
  const parsed = credentials.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige inloggegevens." },
      { status: 400 },
    );
  }
  const pendingCookies: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];
  const timedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(12_000) });
  const supabase = createServerClient(url, anonKey, {
    global: { fetch: timedFetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        pendingCookies.push(...cookies);
      },
    },
  });
  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      return NextResponse.json(
        { error: "Inloggen is mislukt. Controleer je gegevens." },
        { status: 401 },
      );
    }
    const response = NextResponse.json({ ok: true });
    for (const cookie of pendingCookies)
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      {
        error: timedOut
          ? "De authenticatieservice reageert niet. Probeer het over enkele minuten opnieuw."
          : "De authenticatieservice is tijdelijk niet beschikbaar.",
      },
      { status: 503 },
    );
  }
}
