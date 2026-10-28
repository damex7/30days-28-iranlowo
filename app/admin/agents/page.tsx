import type { Metadata } from "next";
import { Suspense } from "react";
import { adminOr404 } from "@/lib/admin-guard";
import { staffOverview } from "@/lib/services/staff";
import { formatDateTime } from "@/lib/format";
import { PromoteForm } from "./promote-form";
import { runCronAction, setActiveAction } from "./actions";

export const metadata: Metadata = { title: "Agents & cron" };

export default function AgentsPage() {
  return (
    <div>
      <h1 className="text-3xl">Agents &amp; scheduled work</h1>
      <Suspense fallback={<div className="skeleton mt-4 h-96" aria-busy="true" aria-label="Loading" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const user = await adminOr404("/admin/agents");
  const { staff, cron } = await staffOverview(user);
  return (
    <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section aria-labelledby="staff-title" className="min-w-0 space-y-4">
        <h2 id="staff-title" className="text-2xl">Staff</h2>
        <ul className="space-y-2">
          {staff.map((s) => (
            <li key={s.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.display_name} <span className="text-sm font-normal text-muted">({s.role}{s.is_read_only ? ", read-only demo" : ""})</span></p>
                <p className="break-all text-sm text-muted">{s.email} · {s.is_active ? "Active" : "Deactivated"}</p>
              </div>
              {s.role === "agent" && !s.is_demo && (
                <form action={setActiveAction}>
                  <input type="hidden" name="userId" value={s.id} />
                  <input type="hidden" name="active" value={s.is_active ? "false" : "true"} />
                  <button className="btn btn-secondary min-h-10 text-sm">{s.is_active ? "Deactivate" : "Reactivate"}<span className="sr-only"> {s.display_name}</span></button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <PromoteForm />
      </section>
      <section aria-labelledby="cron-title" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cron-title" className="text-2xl">Daily maintenance runs</h2>
          <form action={runCronAction}><button className="btn btn-secondary min-h-10 text-sm">Run now</button></form>
        </div>
        <p className="mt-1 text-sm text-muted">Closes conversations resolved over 3 days ago, sends each CSAT email once, flags stale queue items, deletes demo data older than 24 hours.</p>
        {cron.length === 0 ? <p className="card mt-3 p-4">No runs yet.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {cron.map((r) => (
              <li key={r.id} className="card p-3">
                <p className="font-semibold">{formatDateTime(r.started_at)} · {r.trigger}{r.error ? " · ✗ failed" : r.finished_at ? " · ✓ done" : " · running"}</p>
                {r.error ? <p className="text-danger">{r.error}</p> : (
                  <p className="text-muted">
                    closed {r.results.autoClosed ?? 0} · CSAT emails {r.results.csatRequested ?? 0} · stale flagged {r.results.staleFlagged ?? 0} · demo users deleted {r.results.demoUsersDeleted ?? 0}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
