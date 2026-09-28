"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ViewMode } from "../../lib/view-mode";

export function ModeToggle({ initial }: { initial: ViewMode }) {
  const router = useRouter();
  const [mode, setMode] = useState(initial);
  function toggle() {
    const next = mode === "advanced" ? "guided" : "advanced";
    document.cookie = `cmi-view-mode=${next === "advanced" ? "ADVANCED" : "GUIDED"}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.viewMode = next;
    setMode(next);
    router.refresh();
  }
  const label = { guided: "Begeleid", advanced: "Geavanceerd" };
  const other = mode === "advanced" ? "guided" : "advanced";
  return (
    <div className="mode-control">
      <small>Weergave: {label[mode]}</small>
      <button className="mode-toggle" type="button" onClick={toggle}>
        Wissel naar {label[other].toLowerCase()}
      </button>
    </div>
  );
}
