"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function InfoTip({
  label,
  title,
  children,
  watchFor,
  align = "left",
}: {
  label: string;
  title: string;
  children: ReactNode;
  watchFor?: readonly string[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span
      className={`info-tip ${open ? "open" : ""} align-${align}`}
      ref={root}
    >
      <button
        type="button"
        className="info-trigger"
        aria-label={`Uitleg over ${label}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        i
      </button>
      <span className="info-popover" id={id} role="tooltip">
        <strong>{title}</strong>
        <span>{children}</span>
        {watchFor?.length ? (
          <span className="info-watch">
            <b>Let hierop</b>
            {watchFor.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}
