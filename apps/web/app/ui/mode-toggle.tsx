"use client";
import { useEffect } from "react";
export function ModeToggle() {
  useEffect(() => {
    const stored =
      localStorage.getItem("cmi-view-mode") ??
      document.cookie
        .split("; ")
        .find((x) => x.startsWith("cmi-view-mode="))
        ?.split("=")[1];
    const value = stored === "ADVANCED";
    document.documentElement.dataset.viewMode = value ? "advanced" : "guided";
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.viewMode !== "advanced";
    localStorage.setItem("cmi-view-mode", next ? "ADVANCED" : "GUIDED");
    document.cookie = `cmi-view-mode=${next ? "ADVANCED" : "GUIDED"}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.viewMode = next ? "advanced" : "guided";
  }
  return (
    <div className="mode-control">
      <small>Weergave</small>
      <button
        className="mode-toggle"
        type="button"
        onClick={toggle}
        aria-label="Wissel tussen begeleide en geavanceerde weergave"
      >
        Begeleid ↔ Geavanceerd
      </button>
    </div>
  );
}
