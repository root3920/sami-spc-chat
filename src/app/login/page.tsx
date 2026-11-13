"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setError(lang === "es" ? "El enlace venció o ya se usó. Pide uno nuevo." : "That link expired or was already used. Request a new one.");
    }
  }, [lang]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${siteUrl}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setNotice(t.checkEmail);
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password`,
        });
        if (error) throw error;
        setNotice(t.resetSent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full">
      {/* Left: hero image (desktop only) */}
      <div className="relative hidden w-1/2 lg:block">
        <img src="/sami/sami-hero.jpg" alt="Sami, la pingüina de HIC" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900/70 to-transparent" />
        <div className="absolute bottom-10 left-10 max-w-md text-white drop-shadow-lg">
          <p className="text-3xl font-extrabold">Hola, soy Sami 👋</p>
          <p className="mt-2 text-lg text-white/90">Tu guía del Secure Parent Collective, disponible 24/7.</p>
        </div>
      </div>

      {/* Right: form */}
      <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-cream via-sky to-cream px-4 py-10">
        <span aria-hidden className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-[#dbeafc]" />
        <span aria-hidden className="pointer-events-none absolute -right-32 -top-16 h-[26rem] w-[26rem] rounded-full bg-[#e6f0fd]" />
        <span aria-hidden className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-[#ffe7cc]" />

        <div className="absolute right-4 top-4">
          <LangToggle lang={lang} onChange={setLang} />
        </div>

        {/* Mobile Sami image */}
        <img src="/sami/sami-full.png" alt="Sami, la pingüina de HIC" className="relative mb-6 h-[120px] w-auto lg:hidden" />

        <div className="relative w-full max-w-md">
          <div className="rounded-3xl bg-gradient-to-br from-[#3e99ea] via-navy-700 to-navy-900 p-3 shadow-[0_25px_55px_#0b407128]">
            <div className="rounded-2xl bg-white p-7 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#ffd8a8] bg-[#fff4e6]">
                  <img src="/sami/sami-avatar.png" alt="" className="h-12 w-12 object-cover object-top" />
                </span>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-navy">{t.welcome}</h1>
                  <p className="text-sm text-muted">{t.welcomeSub}</p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy" htmlFor="email">
                  {t.email}
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl border border-line px-4 py-3 text-[15px] font-normal text-ink outline-none focus:border-navy-700 focus:ring-4 focus:ring-navy-700/10"
                  />
                  {mode === "signup" && <span className="text-xs font-normal text-muted">{t.useMemberEmail}</span>}
                </label>

                {mode !== "forgot" && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold text-navy" htmlFor="password">
                    {t.password}
                    <input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl border border-line px-4 py-3 text-[15px] font-normal text-ink outline-none focus:border-navy-700 focus:ring-4 focus:ring-navy-700/10"
                    />
                    {mode === "signup" && <span className="text-xs font-normal text-muted">{t.minPassword}</span>}
                  </label>
                )}

                {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                {notice && <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-navy">{notice}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-1 rounded-xl bg-gradient-to-r from-brand-light to-[#ff831e] px-5 py-3.5 text-[15px] font-extrabold text-navy shadow-[0_6px_0_#cc651b22] transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {busy ? "…" : mode === "signin" ? t.signIn : mode === "signup" ? t.signUp : t.sendReset}
                </button>
              </form>

              <div className="mt-5 flex flex-col items-center gap-2 text-sm">
                {mode === "signin" && (
                  <>
                    <button type="button" className="font-semibold text-navy-700 hover:underline" onClick={() => setMode("forgot")}>
                      {t.forgot}
                    </button>
                    <button type="button" className="text-muted hover:text-ink" onClick={() => setMode("signup")}>
                      {t.noAccount}
                    </button>
                  </>
                )}
                {mode !== "signin" && (
                  <button type="button" className="font-semibold text-navy-700 hover:underline" onClick={() => setMode("signin")}>
                    {mode === "signup" ? t.haveAccount : t.backToSignIn}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2">
            <img src="/logo-color.png" alt="HIC Parenting Education" className="h-8 w-auto opacity-70" />
            <p className="text-center text-xs text-muted">© 2026 HIC Parenting Education · Secure Parent Collective</p>
          </div>
        </div>
      </div>
    </main>
  );
}
