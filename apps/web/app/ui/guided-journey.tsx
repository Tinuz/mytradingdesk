import Link from "next/link";

const steps = [
  { key: "today", number: 1, label: "Wat speelt er?", href: "/today" },
  {
    key: "allocation",
    number: 2,
    label: "Wat besluit ik?",
    href: "/allocation",
  },
  { key: "paper", number: 3, label: "Hoe pakt het uit?", href: "/paper" },
] as const;

export function GuidedJourney({ current }: { current: string }) {
  return (
    <nav className="guided-journey guided-only" aria-label="Begeleide route">
      {steps.map((step) => (
        <Link
          href={step.href}
          key={step.key}
          aria-current={current === step.key ? "step" : undefined}
          className={current === step.key ? "active" : ""}
        >
          <b>{step.number}</b>
          <span>{step.label}</span>
        </Link>
      ))}
    </nav>
  );
}
