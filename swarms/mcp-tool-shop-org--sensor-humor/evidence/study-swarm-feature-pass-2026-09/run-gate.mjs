import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { runCitationGate } = await import(
  pathToFileURL("E:/AI/role-os/src/verify-citations.mjs").href
);

const here = dirname(fileURLToPath(import.meta.url));
const dispatch =
  "E:/AI/sensor-humor/swarms/mcp-tool-shop-org--sensor-humor/study-swarm.feature-pass-2026-09.dispatch.md";

const r = runCitationGate(dispatch, {
  provider: "ollama",
  timeout: 1_800_000,
  retries: 0,
  callerFamily: "anthropic",
});

writeFileSync(join(here, "gate-result.json"), JSON.stringify(r, null, 2));
if (r.receipt) {
  writeFileSync(join(here, "citation-receipt.json"), JSON.stringify(r.receipt, null, 2));
}

const summary = {
  verdict: r.verdict,
  pass: r.pass,
  blocking: r.blocking,
  advisory: r.advisory,
  reason: r.reason,
  detail: r.detail,
  n: Array.isArray(r.citations) ? r.citations.length : 0,
  duration_ms: r.duration,
  unparsed: Array.isArray(r.unparsed) ? r.unparsed.length : 0,
};
console.log(JSON.stringify(summary, null, 2));
if (Array.isArray(r.citations)) {
  const by = {};
  for (const c of r.citations) {
    const k = c.finding_match || c.existence || c.verdict || "unknown";
    by[k] = (by[k] || 0) + 1;
  }
  console.log("by_status", JSON.stringify(by));
}
process.exit(r.blocking ? 20 : r.pass ? 0 : r.verdict === "escalate" ? 30 : 10);
