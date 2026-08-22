import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950/60 p-7 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Beveiligde toegang</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-100">Inloggen</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Gebruik je geautoriseerde account voor toegang tot het researchplatform.</p>
        {reason === "session-expired" && <p role="status" className="mt-4 text-sm text-amber-300">Je vorige sessie was ongeldig of verlopen. Log opnieuw in.</p>}
        <LoginForm
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
          anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
        />
      </section>
    </main>
  );
}
