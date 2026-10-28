// npm run db:explain: prints EXPLAIN ANALYZE for the retrieval query.
// With ~150 chunks the planner may prefer a sequential scan (reading a few
// pages is cheaper than an index), so we also show the plan with
// enable_seqscan off, which is what a larger knowledge base gets naturally.

import { withTransaction } from "@/lib/db";
import { SEARCH_SQL, ASSISTANT_MIN_SCORE } from "@/lib/services/retrieval";

const question = process.argv[2] ?? "refnd to my card";
const params = [question, null, ASSISTANT_MIN_SCORE, 5, null, null];

// 1. the real plan; 2. no sequential scans; 3. bitmap index scans only
// (what a large knowledge base gets: each candidate arm through its index).
const variants = [
  { label: "default planner", seqscan: "on", indexscan: "on" },
  { label: "enable_seqscan = off", seqscan: "off", indexscan: "on" },
  { label: "enable_seqscan = off, enable_indexscan = off (bitmap only)", seqscan: "off", indexscan: "off" },
];
for (const v of variants) {
  await withTransaction(async (tx) => {
    await tx.query(`SELECT set_config('enable_seqscan', $1, true), set_config('enable_indexscan', $2, true)`, [v.seqscan, v.indexscan]);
    const rows = await tx.query<{ "QUERY PLAN": string }>(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) ${SEARCH_SQL}`, params);
    console.log(`\n-- question: "${question}"  (${v.label})\n`);
    console.log(rows.map((r) => r["QUERY PLAN"]).join("\n"));
  });
}
process.exit(0);
