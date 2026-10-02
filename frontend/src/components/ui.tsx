import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cx("text-accent", className)}>
      <rect x="3.5" y="2.5" width="12" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
      <rect x="8.5" y="6.5" width="12" height="15" rx="2.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11.5h5M12 14.5h5M12 17.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={cx("animate-spin", className ?? "size-4")} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "size-8",
        variants[variant],
        className,
      )}
    />
  );
}

export function Banner({
  tone = "warning",
  title,
  children,
  action,
}: {
  tone?: "warning" | "danger";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm animate-fade-in",
        tone === "warning" ? "border-warning/25 bg-warning-soft" : "border-danger/25 bg-danger-soft",
      )}
    >
      <AlertTriangle className={cx("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-danger")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{title}</p>
        {children && <p className="mt-0.5 text-fg-2">{children}</p>}
      </div>
      {action}
    </div>
  );
}
