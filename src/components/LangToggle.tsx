"use client";

import type { Lang } from "@/lib/i18n";

export default function LangToggle({ lang, onChange, dark = false }: { lang: Lang; onChange: (l: Lang) => void; dark?: boolean }) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex rounded-full border p-0.5 ${dark ? "border-white/20 bg-white/5" : "border-line bg-white"}`}
    >
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={`rounded-full px-3 py-1 text-xs font-extrabold tracking-wide transition ${
            lang === l ? (dark ? "bg-white text-navy" : "bg-navy text-white") : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
