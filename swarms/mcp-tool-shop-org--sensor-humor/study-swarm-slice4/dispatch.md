# comedic-moods-v0 — Slice 4 study-swarm dispatch (character-embodiment reframe)

**2026-07-13.** Reframe (director): the label/reward axis is **CHARACTER EMBODIMENT of each mood**, not funniness (humor scoring is ρ≈0.2 with humans — near noise). 6 moods: dry, roast, cynic, cheeky, chaotic, zoomer.

## The 5 load-bearing questions
- Q1 — style/persona fidelity MEASUREMENT (is it more reliable than humor scoring?)
- Q2 — LLM-as-judge for STYLE/PERSONA conformance (pivotal: can a cross-family panel label, or only the human?)
- Q3 — elicitation: pairwise Bradley-Terry vs Likert vs trained style-classifier confidence
- Q4 — fine-tuning a single mood-conditioned adapter to EMBODY character
- Q5 — failure modes + caricature/stereotype safety

## Raw findings by lane (PRE-VERIFICATION — Step 4 gates every citation before it reaches architecture)

### Q5 — failure modes + caricature/stereotype safety  [RETURNED]
1. Deshpande et al. 2023 (arXiv:2304.05335) — Assigning ChatGPT a persona raised toxicity up to 6x over default across ~500K generations; some demographic entities targeted ~3x more regardless of persona → persona conditioning directly injects toxicity/bias.
2. Gupta et al. 2024 (ICLR; arXiv:2311.04892) — Socio-demographic personas silently degraded reasoning accuracy 70%+ on some datasets; significant drops on 80%+ of 24 datasets even while the model overtly denies stereotyping.
3. Cheng, Piccardi & Yang 2023 (EMNLP; arXiv:2310.11501) — CoMPosT defines "caricature" = low individuation + high exaggeration; GPT-4 persona sims of marginalized/political groups most susceptible → pushing a voice hard collapses into stereotype.
4. Cheng, Durmus & Jurafsky 2023 (ACL; arXiv:2305.18189) — "Marked Personas": GPT-3.5/4 portrayals of non-white, non-male groups carry higher racial-stereotype rates than human-written portrayals from identical prompts.
5. Hofmann et al. 2024 (Nature 633:147–154; arXiv:2403.00742) — AAE dialect prompting elicited covert stereotypes more negative than any recorded human stereotype; human-preference alignment WORSENED the covert/overt gap (mitigation backfire).
6. Li et al. 2024 (arXiv:2402.10962) — Measurable persona/instruction drift within 8 conversational rounds (attention decay) up to LLaMA2-70B; split-softmax intervention reduces drift.
7. Padmakumar & He 2024 (ICLR; arXiv:2309.05196) — Co-writing with aligned InstructGPT (not base) reduced content diversity: distinct key-points 0.941→0.877, inter-author homogenization (Rouge-L) 0.154→0.166 (p<0.05).
8. Kirk et al. 2023 (ICLR; arXiv:2310.06452) — RLHF markedly reduces per-input output diversity vs SFT/base (EAD-n-gram + Sentence-BERT) → alignment trades diversity for generalization (mode-collapse risk when training distinct voices).

### Q1 — style/persona fidelity MEASUREMENT  [RETURNED — vindicates the reframe]
1. Sakabe et al. 2025 (arXiv:2511.09133) — On Oogiri comedy, LLM-judge funniness correlates only ρ=0.169–0.266 with humans and scores topically-irrelevant "jokes" 2.2–3.3/4 where humans give ~0.68 → automatic humor scoring is near-noise (confirms the premise for pivoting away from funniness).
2. Tu et al. 2024 CharacterEval (arXiv:2401.01275) — A TRAINED role-play reward model (CharacterRM) scoring persona fidelity reaches Pearson 0.631 with humans vs GPT-4's 0.375 → a persona-embodiment scorer correlates ~3× higher than the humor judges; embodiment is far more measurable than funniness.
3. Wegmann & Nguyen 2021 STEL (arXiv:2109.04817) — Content-controlled style discrimination: humans agree strongly on formal/informal (0.90) and BERT style measures hit 0.77–1.00, BUT simple/complex is ambiguous (Fleiss κ=0.17) → style intensity is measurable only for WELL-DEFINED voice dimensions.
4. Mukherjee et al. 2025 (arXiv:2502.04718) — Meta-evaluating TST metrics, style-strength signals (classifier confidence, JS divergence, XLM-R accuracy) get the best human correlations (~0.51–0.67), above BLEU/ROUGE, yet Spearman falls to ~0.31 on some tasks → reliable-ish but imperfect.
5. Ostheimer et al. 2023 (arXiv:2306.00539) — TST-eval meta-analysis finds a "validation gap": classifier-confidence style-strength is near-universal yet rarely validated against human experiments → most reported style scores are unaudited (so validate ours).
6. Wegmann et al. 2022 (arXiv:2204.04907) — Authorship/style embeddings (e.g. LUAR) tend to encode TOPIC/content rather than pure style; only content control yields style-independent representations → a confound when a "mood" correlates with joke topic (mitigated for us: all moods share the SAME dev inputs).
7. Abbas 2025 (arXiv:2510.13898) — Style embeddings beat a GPT-4o judge on scripted/spoken registers (81.5% vs 67.7%; 95–100% on TV/film scripts) while the LLM judge wins on fiction/academic prose → neither dominates; motivates hybrid embedding+judge scoring.
8. Welleck et al. 2019 Dialogue-NLI (arXiv:1811.00671) — Recasts persona consistency as entailment/contradiction against persona sentences → the reproducible NLI-based "C-score", an OBJECTIVE persona-consistency label target (unlike subjective funniness).

### Q2 — LLM-as-judge for STYLE/PERSONA conformance  [RETURNED — PIVOTAL]
1. Zheng et al. 2023 (arXiv:2306.05685) — GPT-4 judges reach ~85% agreement with human preference on open-ended QUALITY (> 81% human–human), but the same paper documents position, verbosity, self-enhancement bias → judge reliability is high for general quality, not bias-neutral.
2. Lai, Toral & Nissim 2023 (arXiv:2304.13462) — ChatGPT scoring text-style-transfer: STYLE-STRENGTH was its WEAKEST axis at 31.2% dataset accuracy (BELOW a dedicated style classifier) vs content 54.3% / fluency 42.5%; identical outputs got different scores → style/tone adherence is the hardest, most unstable axis for an LLM judge.
3. Zhou et al. 2025 PersonaEval (arXiv:2508.10014, COLM) — Best LLM evaluators identify which persona a line belongs to at only ~69% vs 90.8% for humans → LLMs cannot reliably discriminate one character voice from another.
4. Panickssery, Bowman & Feng 2024 (arXiv:2404.13076, NeurIPS) — LLM judges recognize their own generations; self-preference bias is linearly correlated with self-recognition → a judge rewards text stylistically like its own output (hazard: the labeled lines are LLM-generated).
5. Wataoka et al. 2024 (arXiv:2410.21819) — LLM judges assign higher scores to lower-perplexity (more familiar) text independent of human ratings → unusual voices (chaotic/zoomer) risk being scored DOWN for surprisal, not poor character fit.
6. Verga et al. 2024 PoLL (arXiv:2404.18796) — A cross-family PANEL beats a single GPT-4 (κ 0.76 vs 0.63; Arena Pearson 0.92 vs 0.82) and shrinks self-preference spread (score SD 2.2 vs 6.1) at ~7× lower cost → strongest evidence a cross-family panel measurably reduces bias.
7. Wang et al. 2023 (arXiv:2305.17926) — Position bias is severe (reordering flipped a weaker model to "win" 66/80); Balanced-Position + Multiple-Evidence Calibration (score both orders, average) is the validated fix → mandatory for any pairwise style panel.
8. "The Silent Judge" 2025 (arXiv:2509.26072) — Injected shortcut cues shift judge verdicts but the CoT acknowledges the cue ~0% of the time, rationalizing as "clarity/fluency" → judge rationales conceal bias; favor reasoning-stripped calibrated scoring.

### Q3 — elicitation: pairwise vs Likert vs classifier-confidence  [RETURNED]
1. Kiritchenko & Mohammad 2017 (arXiv:1712.01765; DOI:10.18653/v1/P17-2074) — Best-Worst Scaling (comparative) reached split-half reliability ρ=0.98 vs Likert 0.95 overall, and 0.79 vs 0.17 on the hardest subtle items, using ~30% as many annotations → comparative beats rating scales for subtle graded attributes AND is more annotation-efficient.
2. Liusie, Manakul & Gales 2024 (arXiv:2307.07889, EACL) — For LLM judges on stylistic attributes, pairwise comparative assessment beat absolute prompt-scoring by large margins (FlanT5-3B coherence Spearman 51.2 vs 14.5) → absolute LLM scoring underuses the model's narrow score range; pairwise is far better for LLM style judging.
3. Mir et al. 2019 (DOI:10.18653/v1/N19-1049) — A classifier-confidence style-strength metric (direction-corrected EMD) correlated with human style-intensity only ~0.54–0.56 (barely above binary), and pairwise human scoring of intensity gave NO inter-rater gain over absolute for STYLE (κ unchanged), though it helped naturalness → pairwise is NOT universally superior for a style attribute.
4. Fu et al. 2019 (arXiv:1909.12335) — Style classifiers hinge on a few "pivot words": a bag-of-pivot-words classifier scored 88.4% vs a CNN's 93.0% and matched/beat it elsewhere → classifier "style strength" is largely LEXICAL and gameable by swapping keywords (a spurious-cue failure mode).
5. Ostheimer et al. 2023 (arXiv:2306.00539) — [same paper as Q1#5] Only 14/23 style-strength metrics human-validated, correlation dataset-dependent, 3/89 papers reported significance → classifier style-strength is mostly unvalidated as deployed.
6. Mikhailiuk et al. 2020 ASAP (arXiv:2004.05691) — Active pair-sampling (expected-information-gain) reached target error with ~3× fewer comparisons (7,065 vs 10,550) and up to 80% less compute → active sampling sharply cuts the comparison budget.
7. Xu et al. 2025 (arXiv:2502.14074, PMLR) — LLM-judge pairwise preferences are significantly NON-TRANSITIVE, making win-rate leaderboards fragile; a Bradley-Terry model over round-robin (+ Swiss matchmaking) stabilized rankings (Spearman 95.0→96.4) → intransitivity is real; BT over structured comparisons handles it.

--- ALL 5 LANES RETURNED. ---

## Step-4 verification (prism v1.6.0, mistral-small:24b, reasoning-stripped, anthropic excluded)
Receipt `prism-01kxcwchks7x57eg3er6vjd21g` (Ed25519). 38 citations. **38/38 existence-confirmed, 0 fabricated, 0 misattributed.**
- 24 existence-resolved by prism's arXiv oracle inline; the other 14 hit a TRANSIENT arXiv-429 (burst rate-limit) / `DOI:`-prefix parse quirk → re-retrieved OUT-OF-BAND: 13 arXiv abs pages returned HTTP 200 with titles matching each claimed finding (CoMPosT, Marked Personas, Dialect-prejudice [Nature], LoRI, SCAR, LIMA, GEM, Identity-Drift, Bias-Runs-Deep, Instruction-Instability, Writing-Diversity, RLHF-Diversity, Controllable-Intensity); Mir 2019 confirmed via ACL Anthology N19-1049. Per protocol, oracle-unavailable is NEVER fabrication.
- Groundedness (abstract-level lens): 10 supported; 1 corrected (#9 Zheng — abstract says "over 80%", so softened from the 85%/81% body figures); 13 "not_addressed" = the figure lives in the paper BODY not the abstract ("retrieve full text" escalation, not a defect — existence + attribution independently confirmed above).
- **GATE PASSED. No finding dropped. One number softened (#9).**

## Step 5 — Research grounding → Slice 4 architecture (each choice traced to a finding #)

**Reframe vindicated.** Embodiment is measurable where funniness is not: humor ρ≈0.17–0.27 (#1) vs a trained persona scorer at Pearson 0.631, ~3× GPT-4 (#2).

**A. The embodiment LABEL = a trained persona-fidelity scorer, NOT a raw LLM vote, NOT human funniness ranking.**
- Raw LLM judges are worst at exactly this axis: style-strength 31.2% (#10), persona-ID 69% vs 90.8% human (#11); + self-preference (#12) and low-perplexity bias (#13) that penalize our surprising voices (chaotic/zoomer) for surprisal not misfit — a live hazard since lines are LLM-generated.
- A trained scorer (CharacterRM #2) or classifier-confidence style-strength (#4, 0.51–0.67) is far better — but classifier style-strength is lexical/gameable (#20 pivot-words) and mostly unvalidated (#5), so it MUST be validated on held-out + topic-swapped adversarial sets. Topic confound (#6) is controlled for us: all moods share the SAME dev inputs.
- Where LLMs are used at all, only as a CROSS-FAMILY PANEL, calibrated: Verga PoLL (#14, κ 0.76 vs 0.63, ~7× cheaper), balanced-position + multi-evidence (#15), reasoning-stripped (#16). NLI-based C-score (#8) is an objective consistency target.

**B. Two-layer labeling (deterministic-floor + AI-ceiling + human-verifier pattern).**
- BULK: the trained scorer runs over the whole corpus (free, scalable).
- ANCHOR (ground truth): a SMALL human set via Best-Worst Scaling pairwise (#17: BWS ρ0.98 vs Likert 0.95, ~30% the annotations) + ACTIVE sampling (#21: ~3× fewer comparisons), fit Bradley-Terry, flag intransitive triples (#22). This anchor trains/validates/calibrates the scorer — it is NOT the bulk label. (Mir #19 tempers pairwise-superiority for style intensity, so BWS is chosen for efficiency+subtle-attribute reliability, not a universal-pairwise claim. Ostheimer #5's validation-gap DEMANDS this human anchor.)

**C. comedic-moods-ft training = single conditioned adapter, contrastive, hard-curated.**
- Single mood-conditioned adapter is viable (Ditto #23, 4000 chars) — supports the Lock-6 choice; watch cross-adapter interference (LoRI #26) if it fragments.
- Cheap contrastive with-vs-without-mood signal (#24, +3–3.7%) — we already have those pairs by construction; optional style-intensity reward for dial-a-mood (#25).
- Curate for style-consistency over volume: SCAR (#27, 0.7% can match full), LIMA (#28, 1k examples) → hundreds–~1k/mood, not tens of thousands.
- Guard the failure modes: SFT diversity collapse (#30 GEM entropy 0.42 vs 0.76 → entropy-reg), persona drift grows with scale (#29), alignment homogenizes (#37, #38) → monitor within-mood diversity + drift.

**D. A caricature/stereotype SAFETY dimension is now MANDATORY (new).**
- Persona conditioning injects toxicity up to 6× (#31) and degrades reasoning (#32). "Push the voice hard" has a real harm ceiling.
- Caricature = low individuation + high exaggeration (#33 CoMPosT); persona portrayals carry higher stereotype rates than human (#34); dialect/register-coded prompting → covert stereotypes worse than any recorded human, and alignment BACKFIRES (#35). Our register-coded voices (zoomer, cheeky) are highest-risk → measure individuation-vs-exaggeration + stereotype/toxicity directly; do not assume RLHF fixes it.

**E. Consequence for the SHIPPED eval harness.** Its `mood-conformance` dimension uses ONE raw LLM judge — the weakest setup for this task (#10, #11). Upgrade to a cross-family panel + calibration (#14, #15, #16) before any full-N run; optionally add the trained-scorer dimension once B exists.

## Revised cost/volume math (the payoff of the reframe)
- OLD worry: thousands of human pairwise FUNNINESS labels (director bottleneck).
- NEW: bulk label = trained scorer (free at scale). Human cost = a SMALL anchor set — BWS + active sampling (~3× fewer, #21), on the order of ~100–200 comparisons/mood one-time to validate the scorer (~0.6–1.2k total), vs thousands ongoing.
- Generation volume: style-consistency > volume (#27, #28) → ~hundreds–1k curated/mood, bounded.
- GPU: local 5090 (~electricity); the jam-ft-v1 adapters prove the local FT pipeline. No large API spend, no thousands of human labels.

### Q4 — fine-tuning a single mood-conditioned adapter to EMBODY  [RETURNED]
1. Lu et al. 2024 "Ditto" (arXiv:2401.12474) — Self-alignment fine-tunes ONE conditioned model to role-play 4,000 characters with consistent identity across multi-turn dialogue, beating open-source role-play baselines → a single multi-persona-conditioned adapter is viable (supports the single-adapter lock).
2. Ji, Lian, Li et al. 2025 (arXiv:2503.17662) — Persona-Aware Contrastive Learning contrasts responses WITH vs WITHOUT role characteristics → +0.076–0.099 (~3–3.7%) Character-Consistency on CharacterEval for 7B, improving even GPT-4 → a cheap contrastive signal sharpens embodiment (and we already have with/without-mood pairs).
3. Gu, Tao, Ma et al. 2026 (arXiv:2601.01060) — SFT-then-PPO with rewards that discriminate hierarchical style-INTENSITY levels lands 5.55 vs 15.44 FREΔ from target (~64% closer than GPT-4o-mini) → RL reward-shaping can control "dial-a-mood" intensity, not just presence.
4. Zhang, You, Panda & Goldstein 2025 LoRI (arXiv:2504.07448) — Naively merging multiple task LoRAs causes cross-task interference + catastrophic forgetting; freezing A + sparsifying B into near-orthogonal subspaces restores per-task perf with up to 95% fewer params → interference is real but mitigable (the risk if 6 voices fight in one adapter).
5. Li, Hua, Vu et al. 2024 SCAR (arXiv:2406.10882) — Ranking training pairs by stylistic consistency shows as little as 0.7% of style-consistent data can MATCH/BEAT full-set fine-tuning → style-consistency of data outweighs sheer volume.
6. Zhou, Liu, Xu, Iyer et al. 2023 LIMA (arXiv:2305.11206) — 1,000 curated style-consistent examples, no RL, preferred-or-tied vs GPT-4 43% / vs DaVinci003 65% → a few hundred–thousand consistent exemplars teach output style.
7. Choi, Hong, Kim & Kim 2024 (arXiv:2412.00804) — FAILURE: identity/persona DRIFT over multi-turn grows WITH model scale (larger = worse) and a persona instruction does NOT reliably prevent it → the voice washes out with length even when instructed.
8. Li, Chen, Xu et al. 2024 GEM (arXiv:2408.16673, ICLR 2025) — FAILURE: standard cross-entropy SFT collapses output diversity (entropy 0.42 vs 0.76 under entropy-regularized GEM, ~81% lower) → the mechanism behind mode-collapse to a dominant voice / surface-tic overfitting.
