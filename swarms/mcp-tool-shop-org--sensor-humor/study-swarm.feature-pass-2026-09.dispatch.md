# Study-swarm dispatch — sensor-humor Feature Pass (2026-09)

**Repo:** mcp-tool-shop-org/sensor-humor (`@mcptoolshop/sensor-humor`)
**Tree:** local `main` after health A–D of dogfood-swarm run `swarm-1788652660-6b31` (HEAD at init `e1b469d`; health-amend-c landed locally; not pushed).
**Protocol:** Research-Grounded Advisor Protocol ("study-swarm") — research → synthesize → **external-verify (different family)** → connect.
**Why this dispatch:** the 2026-06-30 study-swarm (`study-swarm.dispatch.md`, 29 findings, prism `prism-01kwbkyc0scw6hmny7d60x8jsk`) grounded *safety / funniness-ceiling / CI statistics / degradation signaling*. This pass grounds the *next product layer* so a comprehensive Feature Pass builds the right things and does not ship ROADMAP v2.1 speculation as if it were evidence.

**Do not redo (already canon):** regex floor vs classifier; Spearman ρ≈0.2 LLM-vs-human funniness; Wilson/SPRT three-valued gates; first-person degraded signaling; explicit `running_gag` plant (Xiong 2025 / Memory Sandbox 2023). Those stay.

**Already shipped in 1.3.0 (do not re-propose):** `running_gag` (distance gate default 2, retirement cap default 3, inverted-U, no verbatim, store-time safety refuse); `debug_chain` (in-memory last-10 trace ring); 11 tools. ROADMAP still shows some of these as open boxes — a docs fix, not a feature.

---

## Step 1 — Load-bearing questions

Each has two real designs that hinge on the answer:

- **Q1 — Callback memory.** Keep the tagged ring + distance/retirement gates, or upgrade to a callback *graph* with multi-hop links (ROADMAP v2.1, not pre-approved)? When does humor repetition help vs kill?
- **Q2 — Honest quality beyond form+safety.** Stay at the form-and-safety scorecard forever, or add a second, honestly-named signal (engagement, timing, pairwise-vs-frozen-refs, catchphrase-reuse)?
- **Q3 — Persona vs blend.** Exclusive moods, or `mood.blend(primary, accent, ratio)` (ROADMAP v2.1, not pre-approved)?
- **Q4 — Model routing.** Always-on `SENSOR_HUMOR_MODEL_MAP` (ROADMAP v2.0 P3), or one 7B + prompt/adapter A/B, with routing only as a hard-case cascade?
- **Q5 — Mixed initiative.** Stay strictly reactive (MCP wait-to-be-called), or add unsolicited heckles/gags with a Horvitz-style interruption gate?

## Step 2 — Research dispatch

Five parallel retrieve-then-cite agents (one per question). A paper an agent did not fetch this session did not enter. Word-capped 500–600 per lane; 6–8 findings per lane.

---

## Step 3 — Research grounding

Format: `N. **finding.** Authors year (id). Implication.` One resolvable identifier per finding.

**Q1 — Callback / running-gag architecture (ring vs graph; repetition help vs kill)**

1. **Mere-exposure liking has a positive linear slope and a negative quadratic term (inverted-U): liking rises then falls with more repetitions (268 curves, 81 articles).** Montoya, Horton, Vevea, Citkowicz & Lauber 2017 (DOI:10.1037/bul0000085). Implication: keep a retirement cap; a graph that keeps replaying a bit past the peak satiates the gag.
2. **The repetition-shift (setup, setup, break) structure is common (~1/3 of story jokes/folktales) because similar items build an expectation the last item violates; sheer repetition without a shift is the weaker control.** Loewenstein & Heath 2005 (https://escholarship.org/content/qt96p2r8qs/qt96p2r8qs.pdf). Implication: running gags should vary the payload, not chain extra inferred hops; tags + no-verbatim already encode “same bit, new break.”
3. **A-MEM dynamically links and evolves memories (Zettelkasten-style) and reports gains over SOTA memory baselines on long-horizon agent tasks — the paper’s setting is multi-session factual memory, not hour-scale chat.** Xu, Liang, Mei, Gao, Tan & Zhang 2025 (arXiv:2502.12110). Implication: inferred graphs pay off on long factual QA; this sidekick’s sessions are shorter and already have an explicit plant.
4. **On MemHop, explicit write-time knowledge graphs are not the winner: profile/narrative expansion is a minimal alternative to KG construction and is what drives multi-hop; ProGraph matches FullContext and outperforms HippoRAG, A-Mem, Mem0, and RAG.** Zhu 2026 (arXiv:2607.19359). Implication: inferred bits→gags→catchphrases is the write-time graph this paper argues *against*; keep tagged lookup.
5. **Two-hop graph memory lost to a matched-budget flat vector store on LongMemEval (token F1 down, 95% CI excluding zero); assistant-turn recall fell because entity extraction discards surface form.** Rusu, Khanzadeh & Alalfi 2026 (arXiv:2608.28978). Implication: humor *is* surface form (wording, tag, catchphrase); graphing bits destroys the thing the callback needs.
6. **Once an error is written into memory it outlasts natural-response decay; Memory Repair cuts residual error far more than question-only repair, and episodic stores keep the bad entry indefinitely.** Xiao et al. 2026 (arXiv:2608.30198). Implication: a wrong inferred edge that later fires as a callback is the high-cost failure; explicit plant + retirement is the repair-friendly design.
7. **HippoRAG beats existing RAG on multi-hop QA by up to 20% using a knowledge graph plus Personalized PageRank, at much lower cost than iterative retrieval.** Gutiérrez, Shu, Gu, Yasunaga & Su 2024 (arXiv:2405.14831). Implication: graphs help *curated factual* multi-hop; combined with finding 5, extraction-based graphs lose the surface form humor callbacks need — do not bet callbacks on a 7B OpenIE pipeline.

**Q2 — Honest quality signals beyond form+safety**

8. **Mean conversation length and retention are usable *engagement* proxies: best-of-N trained on continue/no-retry labels raised MCL substantially in large A/B tests, while a star-rating target barely moved length; extra latency cut stickiness.** Irvine et al. 2023 (arXiv:2303.06135). Implication: if a second signal exists, name it “session stickiness,” never “funniness”; star/thumbs are a failed training target.
9. **Across 1,200 real farewells, companion apps used emotional-manipulation tactics in a large share of goodbyes; experiments showed those tactics boosted post-goodbye engagement via reactance-anger and curiosity rather than enjoyment, and raised churn intent.** De Freitas, Oğuz-Uğuralp & Uğuralp 2025 (arXiv:2508.19258). Implication: session length and “they came back” are dark-pattern-confounded; do not treat stickiness as the bit landing.
10. **In 828 live-voted stand-up sets, pause duration and pause variability beat peak semantic incongruity as correlates of votes; pauses were longer before high-surprise lines.** Ma, Peng, Lyu, Zhang & Zhu 2026 (arXiv:2605.00143). Implication: an honest extra signal is *timing* (pause-before-punch / don’t interrupt flow), not a joke-quality score.
11. **THInC ensembles interpretable classifiers on theory-proxy time-series (incongruity, relief, superiority, surprise-disambiguation) and approaches a black-box text baseline with feature functions checkable against hypothesized theory shapes.** De Marez, Winters & Rigouts Terryn 2024 (arXiv:2409.01232). Implication: theory-grounded *form* diagnostics (incongruity burst) can sit beside the skeleton gate; they are still not a comedy meter.
12. **Using sitcom laugh-track duration as gold, a text+audio model detects humorous utterances well above text-only and can predict laugh length; in-situ audience reaction is the valid human eval, not a yes/no funny prompt.** Alnajjar, Hämäläinen, Tiedemann, Laaksonen & Kurimo 2022 (arXiv:2211.01889). Implication: valid human comedy eval is in-situ reaction or pairwise humans, which this MCP server does not have.
13. **Among 410 developers, autocomplete/speed/syntax-recall dominate Copilot motives; distraction and uncontrollability are top non-use reasons.** Liang, Yang & Myers 2024 (arXiv:2303.17125). Implication: coding-session users value non-interruption and acceleration, not joke quality.
14. **N=18 within-subjects: proactive coding agents cut response-comprehension time but raised disruption; about a third of AI proactivity instances were ignored; task-boundary heuristics were the most engaged.** Pu et al. 2025 (arXiv:2502.18658). Implication: a second signal should be *non-interruption / honor-the-boundary rate*, not funniness.

**Q3 — Persona consistency vs mood blending**

15. **CharacterEval treats character consistency as the most crucial role-play dimension because it is the most intuitive user experience when it varies; specialized single-character models beat generalists; scores fall as conversations lengthen.** Tu, Fan, Tian & Yan 2024 (arXiv:2401.01275). Implication: exclusive moods protect the metric users notice first; blend hits that first.
16. **Persona fidelity (knowledge, style, in-character) degrades over long dialogues, faster in goal-oriented task talk than persona-directed chat; models revert toward the no-persona baseline and trade fidelity against instruction-following.** Luz de Araujo, Hedderich, Modarressi, Schütze & Roth 2025 (arXiv:2512.12775). Implication: a coding session is the hostile case; primary+accent is a second constraint that should accelerate character death.
17. **Fine-tuning a separate agent on one character’s experiences reduces character hallucination from collision of knowledge between roles; protective scenes keep the skeleton from leaking out-of-character knowledge.** Shao, Li, Dai & Qiu 2023 (arXiv:2310.10158). Implication: two mood cards in one prompt is knowledge-collision, not a flavor knob.
18. **In a preregistered N=162 companion-chat study, static style beat turn-by-turn linguistic-style matching on personalization and satisfaction; covert mixing destabilizes the parasocial persona (the Adaptation Paradox).** Brandt & Wang 2025 (arXiv:2509.12525). Implication: frozen exclusive skeleton beats live blend; users bond to a stable character.
19. **A bounded overlay (cap on mimicry) raises stability sharply at a modest synchrony cost and cuts register flips; uncapped mimicry is high-sync/low-stability.** Brandt 2025 (arXiv:2510.00339). Implication: technique overlays inside one mood (already true of `comic_timing`) sit on the Pareto frontier; full primary+accent blend does not.
20. **Prompting one model with two style cards fails to co-activate both personas (positive projection on one axis, negative on the other); vector merge can fuse style vs content, but gains are originality, not fidelity.** Pai, Wang, Lu, Sun, Lee & Chang 2025 (arXiv:2510.10157). Implication: two JSON profiles in one prompt is the failure mode; any accent must stay lexical, never a second skeleton.
21. **RoleLLM splits speaking-style imitation from role knowledge; one system-instruction role card beats retrieval mixing of noisy snippets, which distracts.** Wang, Peng, Que et al. 2023 (arXiv:2310.00746). Implication: accent-as-lexicon/catchphrase is safer than accent-as-structure.
22. **Sincere-brand relationships deepen like friendships; a transgression that violates expected personality permanently damages those bonds, while “exciting” flings can reinvigorate.** Aaker, Fournier & Brasel 2004 (DOI:10.1086/383419). Implication: a sidekick sold as one character is a sincere-brand contract; blending moods is a personality transgression.

**Q4 — Per-mood model routing vs one model + prompt**

23. **RouteLLM’s published wins are capability/cost routing between unequal models (strong vs weak), reaching most of the strong model’s score at a fraction of strong-model calls — not same-size 7B style maps.** Ong, Almahairi, Wu, Chiang, Wu, Gonzalez, Kadous & Stoica 2024 (arXiv:2406.18665). Implication: do not read Arena routers as evidence for mood→peer-7B maps.
24. **FrugalGPT’s cascade tries cheaper models first and escalates only when a learned scorer flags the cheap answer, matching the best single LLM at large cost cuts — or a small accuracy gain at equal cost.** Chen, Zaharia & Zou 2023 (arXiv:2305.05176). Implication: if routing exists, it is hard-case escalation of one generator, not always-on per-mood MODEL_MAP.
25. **Hybrid LLM routes by predicted quality gap between sizes; even same-family size routing is difficulty-not-style, and large quality gaps need a quality drop to get small-model coverage.** Ding, Mallick, Wang, Sim, Mukherjee, Rühle, Lakshmanan & Awadallah 2024 (arXiv:2404.14618). Implication: peer-7B mood routing is outside the measured regime.
26. **AutoMix keeps the small model as generator, self-verifies, then routes only when confidence says the larger model pays, and refuses to escalate unsolvable queries.** Aggarwal, Madaan, Anand et al. 2024 (arXiv:2310.12963). Implication: cascade-on-hard, stay-on-one-7B for routine skeleton fills.
27. **Across nine LLMs in multi-turn identity talks, larger models drift more; assigning a persona does not reliably hold identity — model priors dominate.** Choi, Hong, Kim & Kim 2025 (arXiv:2412.00804). Implication: mid-session MODEL_MAP is a persona discontinuity unless the user asked for a new person.
28. **On Qwen2.5-7B, matched expert prompts help writing/roleplay but do not raise overall; gated LoRA on the same 7B beats that by routing the adapter only where personas help.** Hu, Rostami & Thomason 2026 (arXiv:2603.18507). Implication: route adapters/prompts on one base, not full 7B weights.
29. **On Falcon-7B/Llama-7B style tasks, a single in-context steering vector beats both ICL and LoRA fine-tunes on formality/toxicity control.** Liu, Ye, Xing & Zou 2024 (arXiv:2311.06668). Implication: for constrained style, A/B steering on one 7B beats swapping bases.
30. **On LoRA style-rewrite from 0.5B to 7B, an automatic composite score plateaus at 0.69 across all sizes — small models are enough for the measured style task.** Chakravorty 2026 (arXiv:2607.29238). Implication: size/swap is not the style lever; keep one 7B and A/B prompts/adapters on that base.

**Q5 — Mixed-initiative / unsolicited sidekick speech**

31. **Two vignette experiments found anticipatory (unsolicited) AI help raised self-threat vs reactive help, which then cut willingness to accept help, future use, and performance expectancy; asking first did not cancel the threat vs auto-acting.** Harari & Amir 2025 (arXiv:2509.09309). Implication: a confirm-before-heckle micro-gate does not cancel the identity cost of unsolicited comedy.
32. **A proactive coding agent firing on idle/task-boundary heuristics sped comprehension vs prompt-only but caused workflow disruptions and lost awareness of AI actions; users stayed ambivalent.** Pu, Lazaro, Arawjo, Xia, Xiao, Grossman & Chen 2025 (arXiv:2502.18658). Implication: even Horvitz-style timing in an IDE still interrupts; jokes on those triggers add non-task speech. (Same paper as finding 14; counted once for architecture, restated here for the Q5 axis.)
33. **21 programmers labeling 3,137 Copilot segments: verifying suggestions took a large share of session time; unhelpful popups interrupt writing.** Mozannar, Bansal, Fourney & Horvitz 2022 (arXiv:2210.14306). Implication: solicited completions already tax attention; unsolicited jokes compete with verification load.
34. **Field logs of email/IM: an interrupting alert is associated with a multi-minute resumption phase before returning to the pre-alert application state.** Iqbal & Horvitz 2007 (DOI:10.1145/1240624.1240730). Implication: a heckle after N silent turns is not cheap — resumption lag is minutes, not milliseconds.
35. **Mistimed or intrusive proactive assistants cause users to lose trust and disable features; adapting timing, autonomy, and style over sessions raised satisfaction, trust, and comfort (1,000 simulated personas + N=34 humans).** Xuan, Wu, Yan, Namboodiri & Yang 2026 (arXiv:2602.04000). Implication: any proactive humor channel needs opt-in, mute, and per-user timing or it will be turned off.
36. **A one-week adaptive proactive peer-support agent (pause hours if no reply) raised engagement vs user-initiated chat; care-for-user messages beat self-disclosure; most participants kept using after the study.** Liu, Zhao, Liu, Wang & Peng 2024 (arXiv:2407.18064). Implication: gated, user-relevant care can work; unsolicited self-gags (comedy analogue of self-disclosure) were the less-valued class.
37. **A 14-day Slack coach: users ignored a material share of agent prompts and left others unanswered; breakdowns included rigidity, premature turn-taking, overpromising.** Abbas, Wohn, Jagtap, Rho, Kim & Lee 2026 (arXiv:2509.24073). Implication: even scheduled, opted-into check-ins get ignored; file-save gags would follow the same mute path.

**Practitioner / out-of-band (retrieved; not arXiv/Crossref-indexed — not load-bearing alone)**

38. **Callback jokes in Netflix specials drew longer laugh/applause than non-callbacks in a marketer write-up of ongoing Fuqua research; verbatim-repeat ads decayed faster than recontextualized callbacks.** Winet 2025 (https://www.fuqua.duke.edu/duke-fuqua-insights/how-marketers-can-harness-power-of-callbacks). Implication: delayed, *recontextualized* callbacks match the already-shipped distance gate + no-verbatim; multi-hop linking is not what that laugh increment measures. Out-of-band.
39. **An LLM “Humor Index” reports poor test–retest reliability and ~zero correlation with IMDb across hundreds of episodes; its “Impact” axis scores quotability/callback payoff.** The Humor Index 2026 (https://www.thehumorindex.com/methodology/). Implication: pointwise LLM craft/impact and catchphrase-reuse-as-landed are circular. Out-of-band.
40. **Clippy’s unsolicited helper comedy was turned off by default in Office XP; contemporaneous writing called it optimized for first use — amusing once, frustrating after.** Meyer 2015 (https://www.theatlantic.com/technology/archive/2015/06/clippy-the-microsoft-office-assistant-is-the-patriarchys-fault/396653/). Implication: mass-market unsolicited helper comedy was disabled by its maker; do not re-ship as heckles. Out-of-band.

---

## Step 4 — External verification gate

**Synthesizer:** xAI Grok 4.6 (not in prism’s caller-family enum). **Locked runner:** `roleos verify-citations` → `prism verify --type citations --provider ollama` (Mistral `mistral-small:24b`, reasoning-stripped) + arXiv/Crossref retrieval oracle.

Halt table (protocol): FABRICATED → drop; MISATTRIBUTED → correct once; CANNOT_CONFIRM → remove from Step 5 and surface contrastively; verifier/oracle unavailable → HALT, do not treat as “citations fine.”

**Pass 1 — live runner (ANDON, not a pass).** `run-gate.mjs` (timeout 30 min, signing key present). Prism receipt `prism-01m1wwv69bbbzxkn4pcgrsps3b` (Ed25519 kid `ed25519-91914c8d4e99814a`). Verdict `escalate`. 36 arXiv/DOI citations extracted (4 URL-only practitioner items out-of-band, as designed). Crossref DOIs **resolved** (Montoya 10.1037/bul0000085, Aaker 10.1086/383419, Iqbal 10.1145/1240624.1240730). First arXiv hit resolved (A-MEM 2502.12110). Then `export.arxiv.org` **ReadTimeout / rate-limit** — 32 remaining arXiv IDs marked `unresolvable: oracle unreachable`, *not* fabricated. Groundedness therefore did not run on those 32. **This is verifier-oracle-unavailable, not “citations fine.”** Evidence: `evidence/study-swarm-feature-pass-2026-09/`.

**Pass 2 — fallback retrieval oracle (this session, arxiv.org/abs pages, not the export API).** Confirmed **exist, correctly titled, correctly dated** (the postdate-training trap): 2607.19359 Zhu; 2608.28978 Rusu/Khanzadeh/Alalfi; 2608.30198 Xiao et al.; 2605.00143 Ma et al.; 2603.18507 Hu/Rostami/Thomason; 2607.29238 Chakravorty; 2602.04000 Xuan et al.; 2509.09309 Harari/Amir; 2405.14831 Gutiérrez et al. HippoRAG. **0 FABRICATED among retrieved 2026 IDs.** Abstracts were read; findings that overstated body-only numbers were **softened once** (findings 4, 7, 30, 35). Finding 35’s N=30 was **misattributed** (abstract: 1,000 simulated personas + N=34 humans) and corrected.

**Groundedness ceiling (honest).** Title+abstract support the *gists* of the load-bearing claims used in Step 5 (graph loses surface form; unsolicited help raises self-threat; exclusive character; routing is capability-not-style; timing beats semantic incongruity). Precise body figures that prism would have flagged PARTIAL (A-MEM LoCoMo F1 9.65→27.02; HippoRAG REBEL R@2 collapse; pause r=0.36) were **not** used as load-bearing numbers after the soften. A full different-family Mistral pass on all 36 remains **open** — re-run prism in small batches when `export.arxiv.org` is not rate-limited. Until that receipt is `accept`/`revise` with 0 fabricated, treat Step 5 as **existence-gated, abstract-corroborated, not fully LLM-grounded.**

**Practitioner / out-of-band (not in the runner):** findings 2 (eScholarship PDF), 38 (Fuqua Insights), 39 (Humor Index methodology), 40 (Atlantic Clippy). Architecture does not rest on them alone.

---

## Step 5 — Architectural connections (Feature Pass lock)

Each load-bearing choice traces to findings by number. **Existence is retrieval-confirmed for the arXiv/DOI citations used below; body-only numbers were softened. A full Mistral groundedness pass is still open (Step 4 ANDON). Do not treat this lock as prism-`accept`.**

**A — Memory / callbacks (Q1)**

- **A1 — Keep the tagged ring + distance gate + retirement cap + no-verbatim. Do not ship a callback graph.** Inferred multi-hop edges help long factual QA on clean corpora and lose surface form; humor *is* the surface form. (findings 1, 3, 4, 5, 7)
- **A2 — Keep explicit plant (already shipped). Do not auto-infer gag edges.** A wrong written link that later fires is the high-cost failure; retirement is the cheap repair. (finding 6) (Prior dispatch already forbade silent auto-promotion; this re-grounds the *graph* variant of the same mistake.)
- **A3 — Callbacks must vary the payload (repetition-shift), not replay the same line.** Already instructed in 1.3.0; Feature Pass may add a *test contract* that honored callbacks are not byte-identical to setup. (findings 2, 38)

**B — Quality metrics (Q2)**

- **B1 — The scorecard stays a form-and-safety gate. Do not add a funniness number.** Valid comedy eval is in-situ audience reaction or pairwise humans, which this server does not have; LLM craft indices are unreliable. (findings 12, 39) (Prior dispatch §§8–14 still hold.)
- **B2 — Do not treat stickiness, thumbs, or `callback_honored` / catchphrase-reuse as “the bit landed.”** Stickiness is dark-pattern-confounded; reuse is circular with the generator. (findings 8, 9, 39)
- **B3 — If a second named signal is added, it is timing / non-interruption, not quality.** Pause-before-punch and honor-the-boundary rate are the honest extras; coding users already name distraction as a kill-reason. (findings 10, 11, 13, 14)
- **B4 — Do not pursue ROADMAP v2.1 Adaptive Difficulty on 👍/👎 or catchphrase-reuse hit-rate.** That is the failed star-rating / circular-reuse target. (findings 8, 9, 39)

**C — Character / moods (Q3)**

- **C1 — Moods stay exclusive. Do not ship `mood.blend`.** Consistency is the user-facing axis; two style cards fail to co-activate; a coding session is already the hostile (task-dialogue) case for persona death. (findings 15, 16, 17, 18, 20, 22)
- **C2 — *Do* ship mood×technique overlays inside one frozen primary skeleton** (ROADMAP v2.0 P5: roast/heckle `technique` override + capability matrix). Bounded overlay is the Pareto frontier already proven by `comic_timing`. (findings 19, 21)
- **C3 — Accent, if ever, is lexicon/catchphrase under the primary pattern validator — never a second skeleton.** (findings 20, 21)

**D — Models (Q4)**

- **D1 — Keep one local 7B (qwen2.5:7b). Do not ship always-on `SENSOR_HUMOR_MODEL_MAP` as live mood→weights.** Published routers are capability/cost between *unequal* models, not peer-7B style maps; a mid-session swap is a persona discontinuity plus a VRAM/cold-load hitch. (findings 23, 25, 27, 30)
- **D2 — Spend the “model A/B before prompt A/B” lesson on *scorecard/harness* A/B of skeletons (and optional gated adapters) on the same base, not on hot-swapping residents.** (findings 28, 29)
- **D3 — If routing is ever added, it is a hard-case cascade (cheap generator, escalate on scorer/confidence, refuse unsolvable) — not per-mood always-on.** (findings 24, 26)

**E — Initiative (Q5)**

- **E1 — Stay strictly reactive. MCP wait-to-be-called is the product. Do not add unsolicited heckles, file-save gags, or N-silent-turn jokes.** Unsolicited help raises self-threat; coding already spends a large slice of time verifying *solicited* suggestions; interruption resumption is minutes. (findings 31, 33, 34, 40)
- **E2 — Task-boundary timing does not rescue comedy proactivity.** Even a Horvitz-timed coding agent still disrupts; jokes on those triggers are extra non-task speech. (findings 14, 32)
- **E3 — If a proactive channel is ever reconsidered, it is opt-in, mute-on-ignore, pause-on-no-reply, and care-for-user — not self-gags — and it needs a ≥7-day disable-rate RCT before it is a default.** (findings 35, 36, 37)

**What the Feature Pass should actually build (grounded work-list)**

These are the *positive* items this evidence supports. They are **not executed** until the Director approves (dogfood-swarm Law 8 / Phase 6). Feature-audit agents may add production-readiness / UX / integration gaps; they may **not** re-open A1, B1, C1, D1, E1 as “missing features.”

| ID | Build | Why | Effort |
|---|---|---|---|
| FP-1 | **mood×technique** on `roast` / `heckle` (capability matrix, reject invalid combos, primary-pattern validate) | C2 — bounded overlay is the Pareto frontier | medium |
| FP-2 | **Callback variation contract** — honored callbacks must not be byte-identical to planted setup; escalate/vary is testable | A3 | small |
| FP-3 | **ROADMAP reconciliation** — mark `running_gag` / `debug_chain` shipped; mark callback-graph, mood.blend, always-on MODEL_MAP, unsolicited speech, adaptive-difficulty-on-thumbs as **WON'T** with finding numbers | A1, B4, C1, D1, E1 | small (coordinator-owned docs) |
| FP-4 | **Scorecard/harness model A/B** (optional, same base) — a scorecard flag to pin a *single* model for a mood run, not live per-call routing | D2 | small |
| FP-5 | **v1.1 leftover hygiene** still open on ROADMAP: `npm pack --dry-run` CI tarball cap; clean stale dist moods | not research; production-readiness | small |

**Anti-shrink + anti-overbuild guard**

- Do **not** rip out the ring for a graph because “memory agents use graphs now” (over-build; findings 3, 4, 5, 6, 7).
- Do **not** add a funniness metric to look serious (over-claim; findings 12, 39 + prior ρ≈0.2).
- Do **not** blend moods to look like a bigger product (over-build; findings 15, 16, 17, 18, 19, 20, 21, 22).
- Do **not** hot-swap 7Bs per mood because the prompt war said “model A/B first” (misapplied; findings 23, 24, 25, 26, 27, 28, 29, 30).
- Do **not** make the sidekick speak unprompted because mixed-initiative is fashionable (known-broken default; findings 31, 32, 33, 34, 35, 36, 37, 40).
- Do **not** shrink to “never touch comedy intelligence” — technique overlays and callback-variation *are* the grounded comedy-intelligence slice (findings 19, 2).

---

*Generated by the study-swarm protocol, 2026-09-06. Research: five parallel retrieve-then-cite agents (Q1–Q5). Verification: prism receipt `prism-01m1wwv69bbbzxkn4pcgrsps3b` (escalate — arXiv export rate-limit); fallback abs-page existence oracle confirmed 2026 papers, 0 fabricated; body-only numbers softened. Full Mistral groundedness pass still open.*
