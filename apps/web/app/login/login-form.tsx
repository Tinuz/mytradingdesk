"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.email("Voer een geldig e-mailadres in."),
  password: z
    .string()
    .min(8, "Het wachtwoord moet minimaal 8 tekens bevatten."),
});

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const parsed = credentialsSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Ongeldige invoer.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setMessage(result?.error ?? "Inloggen is tijdelijk niet mogelijk.");
        return;
      }
      setMessage("Inloggen gelukt.");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage(
        "De authenticatieservice reageert niet. Probeer het over enkele minuten opnieuw.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
      <label className="block text-sm text-slate-300">
        E-mailadres
        <input
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 outline-none focus:border-slate-500"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <label className="block text-sm text-slate-300">
        Wachtwoord
        <input
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 outline-none focus:border-slate-500"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </label>
      {message && (
        <p role="alert" className="text-sm text-amber-300">
          {message}
        </p>
      )}
      <button
        className="w-full rounded-md bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Bezig…" : "Inloggen"}
      </button>
    </form>
  );
}
