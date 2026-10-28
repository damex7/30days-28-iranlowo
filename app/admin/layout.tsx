import Link from "next/link";

const LINKS = [
  ["/admin/analytics", "Analytics"],
  ["/admin/knowledge", "Knowledge base"],
  ["/admin/ai-runs", "AI runs"],
  ["/admin/agents", "Agents & cron"],
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div>
      <nav aria-label="Admin" className="mb-5 flex flex-wrap gap-1 border-b border-sand pb-3">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="btn btn-quiet min-h-10 text-sm">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
