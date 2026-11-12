"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

export default function UpdatePasswordPage() {
  const { t } = useLang();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-b from-cream via-sky to-cream px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
        <img src="/logo-color.png" alt="HIC Parenting Education" className="mb-6 h-10 w-auto" />
        <label htmlFor="pw" className="flex flex-col gap-1.5 text-sm font-semibold text-navy">
          {t.newPassword}
          <input
            id="pw"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-line px-4 py-3 text-[15px] font-normal outline-none focus:border-navy-700 focus:ring-4 focus:ring-navy-700/10"
          />
          <span className="text-xs font-normal text-muted">{t.minPassword}</span>
        </label>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {done && <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-navy">{t.passwordSaved}</p>}
        <button
          type="submit"
          disabled={busy || done}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-brand-light to-[#ff831e] px-5 py-3.5 font-extrabold text-navy disabled:opacity-60"
        >
          {t.savePassword}
        </button>
      </form>
    </main>
  );
}
