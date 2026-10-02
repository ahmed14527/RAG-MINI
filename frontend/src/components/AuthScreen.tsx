"use client";

import { useState, type FormEvent } from "react";
import { FileSearch, Quote, ShieldCheck } from "lucide-react";

import { ApiClient, ApiError } from "@/lib/api";

import type { HealthState } from "./App";
import { Banner, Button, Logo, Spinner, cx } from "./ui";

type Mode = "login" | "register";

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted/70 " +
  "transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export default function AuthScreen({
  api,
  health,
  sessionExpired = false,
  onRetryHealth,
}: {
  api: ApiClient;
  health: HealthState;
  sessionExpired?: boolean;
  onRetryHealth: () => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm_password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") await api.login(form.username, form.password);
      else await api.register(form);
    } catch (err) {
      setError(err as ApiError);
      setSubmitting(false);
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">Mini RAG</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance">
            Ask your documents.
            <br />
            <span className="text-muted">Get answers you can verify.</span>
          </h1>
          <ul className="mt-10 space-y-5 text-sm">
            {[
              { icon: FileSearch, title: "Semantic search", text: "PDFs, Markdown and text are chunked, embedded and indexed." },
              { icon: Quote, title: "Cited answers", text: "Every answer links back to the exact passages and pages it used." },
              { icon: ShieldCheck, title: "Grounded by design", text: "If your documents don't say it, the assistant tells you so." },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-2">
                  <Icon className="size-4 text-accent" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted">Your documents are private to your account.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">Mini RAG</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "login" ? "Sign in to chat with your documents." : "Start building your private knowledge base."}
          </p>

          {sessionExpired && health.status !== "down" && (
            <div className="mt-6">
              <Banner title="Your session has expired">Please sign in again to continue.</Banner>
            </div>
          )}

          {health.status === "down" && (
            <div className="mt-6">
              <Banner
                tone="danger"
                title={health.error.title}
                action={<Button size="sm" variant="ghost" onClick={onRetryHealth}>Retry</Button>}
              >
                {health.error.details}
              </Banner>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            <Field label="Username">
              <input className={inputClass} autoComplete="username" required value={form.username} onChange={set("username")} />
            </Field>
            {mode === "register" && (
              <Field label="Email">
                <input className={inputClass} type="email" autoComplete="email" value={form.email} onChange={set("email")} />
              </Field>
            )}
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                value={form.password}
                onChange={set("password")}
              />
            </Field>
            {mode === "register" && (
              <Field label="Confirm password">
                <input className={inputClass} type="password" autoComplete="new-password" required value={form.confirm_password} onChange={set("confirm_password")} />
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger animate-fade-in">
                {error.details}
              </p>
            )}

            <Button type="submit" variant="primary" className="h-10 w-full" disabled={submitting || !form.username || !form.password}>
              {submitting && <Spinner />}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className={cx("font-medium text-accent hover:underline underline-offset-2")}
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
    </label>
  );
}
