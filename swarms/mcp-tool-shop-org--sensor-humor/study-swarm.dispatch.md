# Study-Swarm Dispatch — sensor-humor dogfood swarm

**Repo:** mcp-tool-shop-org/sensor-humor (@mcptoolshop/sensor-humor v1.1.1)
**Save point:** `swarm-save-1782800771` · HEAD `df1d556` · 187 tests green · tsc clean
**Protocol:** Research-Grounded Advisor Protocol ("study-swarm") — research → synthesize → **external-verify (different family)** → connect.
**Research dispatch:** Workflow `wf_6c0978af-207` — 4 parallel retrieval-grounded agents, 29 findings, all `retrieved: true`.
**Why a re-audit swarm:** sensor-humor already shipped v1.1.0 via a comprehensive swarm. This dispatch grounds the *next* round (re-audit + the v1.2/v2.0 roadmap) in current empirical evidence, so the swarm hardens the right things and does not over-build.

---

## Standards compliance (inherited)

This dispatch is an **artifact** of the study-swarm protocol (scored **18/18** against the six [[workflow_standards]] — PIN/ANDON/COMPENSATORS/DECOMPOSE/UNCERTAINTY/EXTERNAL_VERIFIER) and feeds the dogfood-swarm protocol (PROTOCOL.md). The load-bearing standard here is **EXTERNAL_VERIFIER**: every citation below is gated through `prism verify --type citations` (different model family — local `mistral-small:24b`, reasoning-stripped — + a deterministic arXiv/Crossref retrieval oracle). No Claude-family agent grades its own homework. ANDON: a FABRICATED verdict drops the finding; verifier/oracle-unavailable HALTS rather than reading as "fine".

---

## Research grounding (the dispatch's empirical floor)

29 findings across four load-bearing questions. Format: `**finding.** Authors year (id). → implication for sensor-humor.`

### Q1 — Safety filter: post-hoc regex vs. guardrails state of the art

The literature converges hard: **keep the regex as an honest deterministic floor; do NOT swap it for a classifier; the cheapest real hardening is input NORMALIZATION.**

1. **ASCII-art / spatial obfuscation evades every text-only moderation system at 100% ASR.** Berezin et al. 2024 (arXiv:2409.18708, ToxASCII, 7,046 samples; 1.00 ASR vs Perspective, OpenAI Omni-Moderation, *and* Llama Guard 3). → Our wordlist is on the weak side of this divide; document obfuscated toxicity as an explicit out-of-scope ceiling.
2. **Homoglyph/character perturbations collapse moderation APIs to near-random.** Kang et al. 2024 (arXiv:2412.15267 — OpenAI Moderation 50.77%, Perspective 94.28%→64.84%). → A classifier would *not* fix this either; the leverage is **Unicode NFKC fold + strip zero-width/confusables + collapse spacing BEFORE the regex.**
3. **Learned guard models are themselves bypassed at high rates.** Wang et al. 2024 (arXiv:2410.05573, TaeBench — 77.22% ASR vs Llama Guard, but 8.94% vs multi-stage NeMo). → Don't swap the wordlist for a single guard model (it's *more* bypassable for some inputs); composition/layering is what helped.
4. **A cheap deterministic regex stage is the recommended FIRST tier of defense-in-depth.** Majhi et al. 2026 (arXiv:2512.19011 — Regex→CPU→GPU cascade; <0.2 ms regex resolved 18% of traffic). → Validates our architecture: keep regex as the auditable, offline, zero-latency floor; frame it as Stage 1, not the whole defense.
5. **A classifier beats wordlist/API baselines on *benign* toxicity, but only modestly.** Inan et al. 2023 (arXiv:2312.06674 — Llama Guard 0.626 AUPRC vs OpenAI 0.588 / Perspective 0.532). → ~0.04–0.09 AUPRC gain, and it evaporates under obfuscation; not worth a 7B guard model's latency/VRAM for a humor tool.
6. **Guard-grade jailbreak robustness requires a context-aware learned classifier with real cost.** Sharma et al. 2025 (arXiv:2501.18837, Constitutional Classifiers — 3,000+ red-team hrs, no universal jailbreak, +23.7% inference overhead). → Sets the honest README ceiling: the regex floor is explicitly NOT a guardrail vs semantic/jailbreak harm, by deliberate design.
7. **Regex is appropriate exactly where its properties are load-bearing** (precision, auditability, sub-ms latency, no false-accept on a fixed list). Majhi et al. 2026 (arXiv:2512.19011). → Our terminal-safety-gate (re-run both filters after every retry, collapse to input-free static line) *is* this endorsed pattern; the CI gate should test the floor's guarantee, not pretend to test adversarial robustness.

### Q2 — Automatically evaluating humor / limits of pattern + LLM-judge proxies

The literature is **sharply unfavorable to claiming any automated number measures "funniness."** Honest ceiling for the gate: *well-formed, safe, on-pattern, non-degraded* — NOT *funny*.

8. **Even the best LLM judges correlate weakly with human funniness (Spearman ρ 0.17–0.27).** Sakabe et al. 2025 (arXiv:2511.09133, Oogiri rubric — ρ topped at 0.266; LLMs optimize novelty, humans weight empathy). → Never let one LLM judge emit a "funniness" score for the gate; ρ≈0.2 is near-noise.
9. **A pairwise *tournament* is the more reliable way to rank LLM humor.** Ajayi et al. 2026 (arXiv:2604.19786, HumorRank — theory-grounded GTVH Bradley-Terry pairwise judgments; rankings cross-judge stable at **Kendall τ=0.889** across independent Llama and Qwen judges). → If any humor signal is added, prefer a *pairwise tournament vs a frozen reference* over pointwise scoring; the method is more stable than isolated metrics or limited human eval. *(Corrected 2026-06-30: the original draft asserted "~49% LLM-human alignment / α=0.40" — the prism gate flagged this as **CONTRADICTED** by the source abstract (which reports τ=0.889 cross-judge stability); the unsupported figures were dropped and this source-accurate claim re-verified `accept`.)*
10. **LLM-as-judge carries ≥12 quantified biases (verbosity, position, self-enhancement).** Ye et al. 2024 (arXiv:2410.02736, CALM — position robustness as low as 0.566). → A judge must hide the generator's identity/reasoning and randomize pair order; **never use the qwen2.5 generator as its own judge.**
11. **n-gram metrics (BLEU/ROUGE) correlate poorly with human judgment on creative tasks.** Liu et al. 2023 (arXiv:2303.16634, G-Eval — CoT GPT-4 reaches only ρ≈0.514). → Our regex/skeleton hit-rate is the n-gram class this criticizes; keep it as a *structural* check, stop treating conformance as quality.
12. **Pattern/structural creativity proxies conflate surface variation with originality.** Lu et al. 2025 (arXiv:2508.05470 — syntactic-template/n-gram metrics ineffective in formulaic language; "unique n-grams ≠ idea originality"). → Direct verdict that skeleton-pattern hit-rate is **not** a funniness proxy; rename the gate, drop creativity claims from docs/roadmap.
13. **A cross-family judge panel beats a single judge and cuts self-preference, 7–8× cheaper.** Verga et al. 2024 (arXiv:2404.18796, PoLL — κ 0.763 vs 0.627). → If a judge is added, use a small cross-family local panel, not one judge.
14. **But correlated errors mean 9 judges ≈ 2.2 effective votes; a panel is not a reliability silver bullet.** Kohli et al. 2026 (arXiv:2605.29800 — aggregation closes ≤~11% of the gap). → Temper panel claims; the gate must be human-anchored to a small held-out labeled set, never "panel agreement = ground truth."

### Q3 — Regression gates for stochastic LLM features in CI

**N=10 is unsound.** The roadmap's "fail if a mood drops below 65% over N=10" red-flags healthy moods and misses real regressions.

15. **Use the Wilson interval, not the Wald/point estimate.** Brown, Cai & DasGupta 2001 (DOI:10.1214/ss/1009213286). → Gate on hits/N via a Wilson interval; fail only when the Wilson *upper* bound < 0.65 (this auto-demands enough samples before red-flagging).
16. **At N=10 a healthy 75% mood dips below 65% ~22% of the time by chance.** Brown/Cai/DasGupta 2001 (~14 pp binomial SD at p≈0.7). → ≈73% false-alarm across 6 independent moods/run; N=10 cannot separate 75% from 60%. A sound N for a ~10 pp drift is **~150–200 calls/mood.**
17. **Make the gate three-valued: PASS / FAIL / INCONCLUSIVE.** Bhardwaj et al. 2026 (arXiv:2603.02601 — stochastic CI gates as hypothesis tests). → PASS if Wilson lower > 0.65, FAIL if Wilson upper < 0.65, else INCONCLUSIVE (collect more) — never block a merge on an undecided mood (this is ANDON at the gate).
18. **SPRT cuts the sample count ~78% vs fixed-N at the same error bounds.** Bhardwaj et al. 2026 (arXiv:2603.02601). → Implement the gate as SPRT (H0 rate≥0.72 vs H1 ≤0.62, α=β=0.05): stop early on clearly good/bad moods, pay full N only on borderline ones.
19. **SPRT can be calibrated to an LLM's own output distribution.** Lee et al. 2025 (arXiv:2503.17587, ConSol — matches fixed-N 40–64 samples at lower cost). → Tune SPRT thresholds per mood so cheap moods settle in <30 calls.
20. **temp=0 is NOT deterministic** (batch-size-dependent float reduction order flips tokens). Yuan et al. 2025 (arXiv:2506.09501). → Do not "fix" flakiness with temp=0 exact-match golden tests on humor output; reserve exact-match for the CPU-side regex/base64 safety filters only.
21. **Safety behavior is itself unstable across seeds; one clean run proves nothing.** Larsen et al. 2024 (arXiv:2512.12066). → Test the terminal safety gate over **many seeds**; require a one-sided 99% Wilson upper bound on leak-rate < 0.5%.
22. **Split CI: a tiny deterministic golden set as the per-PR hard gate + the statistical hit-rate gate nightly.** Kinde "CI/CD for evals" 2026 (practitioner guide, retrieved out-of-band). → Per-PR: 10–20 fixed-input cases asserting skeleton rules + safety behavior. Nightly: the SPRT/Wilson mood hit-rate drift gate.

### Q4 — Honest degradation signaling & trust calibration (Stage C)

Make the degraded state **LOUD, first-person, and machine-typed** — silent substitution is the documented failure mode.

23. **Calibrated trust requires the signal to track *actual* reliability.** Lee & See 2004 (DOI:10.1518/hfes.46.1.50_30392). → Emit `degraded` every time a fallback fires; a fallback that reads as genuine breaks calibration.
24. **Confident-looking output drives uncritical acceptance regardless of correctness.** Bansal et al. 2021 (arXiv:2006.14779). → Never let a canned fallback read as a real roast; visibly tag it.
25. **First-person uncertainty framing measurably reduces overreliance; passive phrasing doesn't.** Kim et al. 2024 (arXiv:2405.00623). → Human-facing degraded copy is first-person + contrastive ("I couldn't generate a real line — this is a canned fallback"), not "humor unavailable."
26. **Tuned LLMs are systematically overconfident; their self-reported confidence is an unreliable trust signal.** Groot & Valdenegro-Toro 2024 (ACL:2024.trustnlp-1.13, retrieved out-of-band). → Ground `degraded` on deterministic facts (backend status, filter fire), never on qwen's self-rated certainty.
27. **Cognitive forcing cuts overreliance but users dislike heavy friction.** Bucinca et al. 2021 (arXiv:2102.09692). → Keep the disclosure terse and non-blocking (metadata/tag), not a heavy interstitial — preserve the playful UX.
28. **Surface-vs-suppress should be governed by the cost of being wrong, with a safety net.** Horvitz 1999 (DOI:10.1145/302979.303030, mixed-initiative). → Cost-gate it: a degraded `comic_timing` rewrite (can corrupt caller text) is flagged loudly; a missing standalone `heckle` can fail quietly.
29. **Silent degradation is the dominant agent failure mode; make degraded states explicit and machine-detectable.** Tan 2026 + graceful-degradation patterns (practitioner sources, retrieved out-of-band). → `degraded_reason` is a **closed enum** (`backend_down` | `safety_filter` | `timeout`) a consuming agent branches on; add a CI assertion that a degraded response is never byte-identical to a genuine one and always carries `degraded:true` + a valid reason.

---

## External verification gate (Step 4) — PASSED (with one correction)

Ran `prism verify --type citations --provider ollama --caller-family anthropic` (prism v1.6.0): a **different model family** (`mistral-small:24b`, `sees_reasoning:false` — reasoning-stripped, `anthropic` excluded by construction) for groundedness, over a **deterministic arXiv/Crossref retrieval oracle** for existence. 23 academic citations gated; the 4 practitioner/web sources (Kinde, Groot ACL, buildmvpfast, Tan) are out-of-band (the research agents retrieved them; not arXiv/Crossref-indexed).

**Receipt `prism-01kwbkyc0scw6hmny7d60x8jsk`** — Ed25519, kid `ed25519-6a116ca746d97106`, `replayable:true`, **`signature_valid: true` (verified with the public key alone, no secret)**. Evidence: [`evidence/study-swarm/`](evidence/study-swarm/) (receipt, public key, citations, full per-citation results).

| Axis | Result |
|---|---|
| **Existence (oracle)** | **23/23 `resolved` · 0 FABRICATED** — every arXiv ID + DOI resolved on arXiv/Crossref, incl. all five 2026-dated papers (the postdates-training trap). The corpus is real. |
| **Groundedness (mistral-small:24b)** | **10 `supported`** · **12 `escalate`** (claim in paper *body* not title+abstract, or a Crossref DOI with no abstract — e.g. Lee&See 2004, Horvitz 1999, Brown 2001) · **1 `CONTRADICTED`** |
| **Headline verdict** | `revise` (the gate discriminated — it did not rubber-stamp) |

**ANDON action taken (per the halt table):**
- **CONTRADICTED — §9 HumorRank (arXiv:2604.19786):** the draft's "~49% LLM-human alignment / α=0.40" was contradicted by the abstract (which reports τ=0.889 cross-judge stability). **Corrected** to the source-accurate claim and **re-verified `accept`** (correct-once). No load-bearing decision depended on the false figures.
- **12 escalate (body-not-abstract):** NOT failures — existence is oracle-confirmed and each abstract substantively corroborates the claim's gist (e.g. ToxASCII abstract: "perfect Attack Success Rate across SOTA LLMs and dedicated moderation tools" ✓ §1; Bansal abstract verbatim: "explanations increased the chance that humans will accept the AI's recommendation, regardless of its correctness" ✓ §20; PoLL abstract: "outperforms a single large judge … over seven times less expensive" ✓ §13). The precise numerics live in the full text, which the research agents retrieved (`retrieved:true`). This is the documented arXiv-oracle behavior (title+abstract grounding is strict on exact figures).
- **0 FABRICATED → 0 dropped.** Every paper exists and is correctly attributed.

**Net:** the empirical floor holds. One misgrounded statistic was caught and corrected; the architecture below is unaffected (F5 stands on §8/§10/§13/§14; F1 on §11/§12 — all supported or abstract-corroborated).

---

## Architectural connections (Step 5) — what the dogfood swarm should do

Each load-bearing swarm decision traces to findings by number. **This is the swarm's grounded work-list.**

### Stage A (bug/security) — the safety gate

- **A1 — Add input normalization BEFORE the slur regex** (the single highest-leverage hardening). Extend `sanitizeForPrompt` (and a new normalize step feeding `HARSH_FILTER`/`SIMILE_PATTERN`) with **Unicode NFKC fold + strip zero-width/confusables (Cf, variation selectors) + collapse intra-word spacing**. Today `sanitizeForPrompt` strips control chars and collapses runs of spaces but does **not** NFKC-fold or strip confusables — a homoglyph or zero-width-laced slur in caller input would pass the regex and could be echoed. → **§2, §1.**
- **A2 — Keep the regex floor; do NOT add a classifier layer.** Evidence says a single guard model is *more* bypassable and only modestly better on benign text. → **§3, §4, §5, §6.** (An *optional, local* ShieldGemma/Llama-Guard pass is a future ceiling-raiser, never a floor-replacer — note in ROADMAP, not this swarm.)
- **A3 — Statistically test the terminal safety gate.** Replace any single-run safety assertion with a many-seed probe; require one-sided 99% Wilson upper bound on leak-rate < 0.5%. → **§21, §7.**

### Stage C (humanization) — the degradation signal

- **C1 — `degraded_reason` becomes a closed enum** (`backend_down` | `safety_filter` | `timeout`) so a consuming agent branches deterministically. → **§29, §28.**
- **C2 — First-person, contrastive human-facing copy** for the degraded line; never let a fallback read as genuine; keep it terse/non-blocking. → **§24, §25, §27, §23.**
- **C3 — Ground `degraded` on deterministic facts, never on model self-confidence.** (Already true — the signal fires on backend status / filter fire; lock it with a test and a comment citing §26.) → **§26.**
- **C4 — Cost-gated surfacing:** loud for `comic_timing` (can corrupt caller text), quiet-OK for a missing `heckle`. → **§28.**
- **C5 — CI contract:** a degraded response is never byte-identical to a genuine one and always carries `degraded:true` + a valid reason. → **§29.**

### Feature pass — the v1.2 "prompt stability lock" (rebuild on sound footing)

- **F1 — Rename the gate honestly.** It is a **structural conformance / form-and-safety regression gate** (skeleton match, no simile, passes safety filter, non-degraded), **NOT** a "comedy" / "funniness" gate. Drop creativity/funniness claims from ROADMAP + docs. → **§12, §11.**
- **F2 — Fix the statistics.** N=10 @ 65% is unsound. Gate on a **Wilson interval**, **three-valued (PASS/FAIL/INCONCLUSIVE)**, with **SPRT** early-stopping; sound N ≈150–200/mood for a 10 pp drift. → **§15, §16, §17, §18, §19.**
- **F3 — Split CI surfaces.** Per-PR: a tiny deterministic golden set (skeleton + safety on fixed inputs, exact-match on the CPU regex layer only). Nightly: the SPRT/Wilson mood-drift gate. Do NOT use temp=0 golden tests on humor output. → **§22, §20.**
- **F4 — Prompt/model fingerprint** in `debug_status` (hash of active prompt text + model id) for drift attribution / PIN_PER_STEP replayability — already on the roadmap; this grounds *why*. → **§17, §18.**
- **F5 (optional, defer) — if a quality signal is wanted:** a **separate** pairwise (not pointwise) LLM-judge vs a frozen reference set, on a **different family** than qwen, anchored to a one-time small human-labeled calibration set; tempered panel expectations. → **§8, §9, §10, §13, §14.**

### What NOT to do (the anti-shrink + anti-overbuild guard)

- Do **not** rip out the regex for a guard model (over-build; §3–§6).
- Do **not** claim the scorecard measures funniness (over-claim; §8–§12).
- Do **not** ship the N=10/65% gate as-is (false-alarm machine; §16).
- Do **not** "fix" humor-output flakiness with temp=0 golden tests (§20).

---

*Generated by the study-swarm protocol, 2026-06-30. Research: Workflow `wf_6c0978af-207` (29 findings). Verification: prism v1.6.0, receipt `prism-01kwbkyc0scw6hmny7d60x8jsk` (signature_valid:true) — 23/23 exist, 0 fabricated, 1 contradicted→corrected. EXTERNAL_VERIFIER satisfied: a different family graded the homework.*
