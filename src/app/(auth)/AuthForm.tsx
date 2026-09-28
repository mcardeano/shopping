"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";

export function AuthForm({ mode, demoAvailable }: { mode: "login" | "signup"; demoAvailable: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [withSamples, setWithSamples] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    try {
      if (mode === "login") await apiFetch("/api/auth/login", { body: { email, password } });
      else await apiFetch("/api/auth/signup", { body: { name, email, password, withSamples } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  async function demo() {
    setBusy("demo");
    try {
      await apiFetch("/api/auth/demo", { body: {} });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo unavailable.");
      setBusy(null);
    }
  }

  const field = "h-13 w-full rounded-[16px] bg-surface px-4 text-[16px] shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1.5px_var(--color-olive)]";
  return (
    <div className="flex flex-1 flex-col px-6 pb-10 pt-[max(env(safe-area-inset-top),48px)]">
      <p className="font-display text-[22px] italic text-olive">Larder</p>
      <h1 className="mt-8 font-display text-[50px]">{mode === "login" ? "Welcome back." : "Your food memory starts here."}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        {mode === "login" ? "Everything you've saved, cooked and need to buy." : "Save recipes from anywhere. Get dinner ideas that fit how you actually eat. Never forget the toilet paper again."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-2.5">
        {mode === "signup" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" required className={field} />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="email" required className={field} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : 1} required className={field} />
        {mode === "signup" && (
          <label className="flex items-center gap-3 px-1 py-2 text-[14.5px] text-ink-2">
            <input type="checkbox" checked={withSamples} onChange={(e) => setWithSamples(e.target.checked)} className="h-5 w-5 accent-[#68735B]" />
            Start with 25 sample recipes
          </label>
        )}
        {error && <p className="rounded-[14px] bg-terracotta-soft px-4 py-3 text-[14px] text-terracotta-deep">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy === "form"}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {demoAvailable && (
        <div className="mt-6">
          <div className="flex items-center gap-3 text-[12.5px] text-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" size="lg" className="mt-6 w-full" onClick={demo} loading={busy === "demo"}>
            Explore with a demo household
          </Button>
          <p className="mt-2 text-center text-[12.5px] text-muted">Three months of saved recipes, cooking and shopping — already learned.</p>
        </div>
      )}

      <p className="mt-auto pt-10 text-center text-[14px] text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-ink underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
