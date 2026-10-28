const LABELS = {
  ai: { text: "With assistant", icon: "◇" },
  waiting_human: { text: "Waiting for agent", icon: "◷" },
  human: { text: "With agent", icon: "●" },
  resolved: { text: "Resolved", icon: "✓" },
  closed: { text: "Closed", icon: "■" },
} as const;

/** Status as text plus a symbol: never colour alone. */
export function StatusBadge({ status }: { status: keyof typeof LABELS }) {
  const l = LABELS[status];
  const tone =
    status === "waiting_human"
      ? "border-warn bg-warn-soft text-warn"
      : status === "human"
        ? "border-iroko bg-iroko-soft text-iroko"
        : status === "resolved" || status === "closed"
          ? "border-line-strong bg-card text-muted"
          : "border-muted bg-card text-ink";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <span aria-hidden="true">{l.icon}</span>
      {l.text}
    </span>
  );
}
