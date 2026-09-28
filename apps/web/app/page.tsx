import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        Paper decision terminal
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-100 md:text-6xl">
        Crypto Macro Intelligence
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
        Ontdek mogelijke in- en uitstapmomenten, leg je eigen beslissing vast en
        volg het resultaat met fictief kapitaal. De app plaatst nooit orders en
        raakt geen echt geld aan.
      </p>
      <Link
        className="mt-10 w-fit rounded-md border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-200 hover:border-slate-500"
        href="/login"
      >
        Naar de beveiligde testomgeving
      </Link>
    </main>
  );
}
