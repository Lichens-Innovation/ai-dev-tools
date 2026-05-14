import React from "react";

export const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-2)",
  border: "1px solid var(--line)",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "0.9rem",
  color: "var(--ink)",
  outline: "none",
  fontFamily: "inherit",
};

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-start justify-center overflow-y-auto px-4 py-6"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="flex w-full max-w-3xl flex-col rounded-xl border p-10"
        style={{
          background: "var(--bg-2)",
          borderColor: "var(--line)",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ModeCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer select-none rounded-lg border p-4 transition-colors"
      style={{
        borderColor: active ? "var(--primary)" : "var(--line)",
        background: active ? "var(--bg-3)" : "transparent",
      }}
    >
      <div className="mb-1.5 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </div>
      <div className="text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
        {description}
      </div>
    </div>
  );
}

export function Divider() {
  return <hr className="my-5" style={{ borderColor: "var(--line)" }} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4.5">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={inputStyle} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, appearance: "none" }} />;
}

export function DoneScreen({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Page>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h2 className="mb-2 text-base font-semibold text-(--ink)">{title}</h2>
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          {subtitle}
        </p>
      </div>
    </Page>
  );
}

export function FormActions({
  onCancel,
  submitLabel,
  submitting,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="mt-auto flex gap-2.5 pt-6">
      <button
        type="button"
        onClick={onCancel}
        className="cursor-pointer rounded-lg border px-5 py-3 text-[0.95rem] font-medium transition-colors"
        style={{ background: "transparent", borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="w-25 cursor-pointer rounded-lg border-none py-3 text-[0.95rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--primary-3)", color: "#1c1917" }}
      >
        {submitting ? "Sending…" : submitLabel}
      </button>
    </div>
  );
}
