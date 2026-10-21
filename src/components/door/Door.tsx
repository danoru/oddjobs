import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import d from "./Door.module.css";

/**
 * The door's pieces: a notice pinned under the hanging sign, inked fields
 * with their errors read out, and the wax-seal submit button. Shared by
 * /login, /join/<code>, /reset/<token> and /settings.
 */

export function DoorPage({ header, title, lede, children, wide = false, tilt }: { header?: string; title: string; lede?: ReactNode; children: ReactNode; wide?: boolean; tilt?: number }) {
  return (
    <div className={d.wrap}>
      <header>
        <Link href="/" className={d.sign}>
          Oddjobs
        </Link>
      </header>
      <main id="main" tabIndex={-1} className={`${d.notice} ${wide ? d.wide : ""}`} style={tilt === undefined ? undefined : { ["--tilt" as string]: `${tilt}deg` }}>
        <span className={d.pin} aria-hidden="true" />
        {header && <p className={d.header}>{header}</p>}
        <h1 className={d.title}>{title}</h1>
        {lede && <p className={d.lede}>{lede}</p>}
        {children}
      </main>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  ...input
}: { id: string; label: string; hint?: string; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={d.field}>
      <label htmlFor={id} className={d.label}>
        {label}
      </label>
      <input id={id} name={id} className={d.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <span id={`${id}-hint`} className={d.hint}>
          {hint}
        </span>
      )}
      {error && (
        <p id={`${id}-error`} className={d.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Seal({ children, busy, ...rest }: { children: ReactNode; busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="submit" className={d.seal} disabled={busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}

export function Alert({ children, ok = false }: { children: ReactNode; ok?: boolean }) {
  return (
    <p className={ok ? d.ok : d.alert} role={ok ? "status" : "alert"}>
      {children}
    </p>
  );
}

export { d as doorStyles };
