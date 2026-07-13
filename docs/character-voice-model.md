# The Character Voice Model — v0.5

A descriptive, tunable model of a comedic **character's** voice. It is *not* a joke-scorer — it is the
system the studio's comedic characters (the six "moods" and beyond) are developed and fine-tuned against.
Each character is one **profile** configured against the versioned schema (`src/character/voice-schema.ts`);
the profiles live at `src/character/profiles/*.json`. The **Dry British voice** is the first filled profile
(`profiles/dry-british.json`).

Design is **study-swarm-grounded and family-different-verifier-checked** — see *Research grounding* below.
Positions are a value in `[0,1]` on a **named continuum** (0 = low pole, 1 = high pole): a tunable knob, not
a stat. The poles and the prose `note` carry the accurate description.

## The five layers (independent by design)

The core move: a comedic voice factors into **five layers that can be tuned independently**. *Who the
character is* must be separable from *how the text is built*, *how it's performed*, and *who it's for* —
otherwise you can't fine-tune (you could never make a character dry in psyche but warm in delivery). This
independence is not a hunch; four disciplines already carve voice up this way (see grounding).

| Layer | What it holds | The question |
|---|---|---|
| **Psyche** | worldview, warmth, self-awareness, repression, cast of mind, long-suffering, **the internal check** | who are they *inside*? |
| **Theme** | the intensity slider of *what the comedy conceals* | what is it *about*? |
| **Rhetoric** | understatement, irony, absurdity + the signature devices | how is the *line built*? |
| **Delivery** | affect, tempo, pause, register, diction, prosody, the spoken-vs-inner split, the tell | how is it *performed*? |
| **Stance** | class-awareness (lens), subject, direction (up/inward/down), relationship | who is it *for*? |

> **Interplay example:** `Repression` (Psyche) drives `Affect: suppressed` (Delivery), whose breach *is*
> `the tell` (Delivery). Same phenomenon, three layers — now independently dial-able. Turn Psyche dry but
> Delivery expressive and you get a character the flat model couldn't even describe.

## Two mechanisms that make it grow

- **Gradation (`refines`).** Any dimension can resolve into finer sub-dimensions. The Psyche **`filter`**
  (the internal check) is one playable knob that *resolves into a vector*:
  `capacity-to-aim × disposition-to-check × suppression-threshold`, the verdict computed per-line against
  audience distance. This cleanly separates the **deluded** character (low capacity-to-aim — can't read the
  room) from the **chaotic** one (high aim, low threshold — *knows* it'll land badly, says it anyway).
- **Neighbours.** A profile names adjacent character families reachable by moving a dial. The Self-awareness
  axis *is* the **dry ↔ cringe** boundary: lower it (+ raise warmth/pathos) and you leave dry for cringe
  (Partridge, Brent). The system spans the neighbourhood; the labels must not conflate it.

## The Dry British voice (the first filled profile)

*Core attitude:* composure worn over a private catastrophe — wit as the seam where the two meet, sincerity
held at arm's length. Highlights (full values in the JSON):

- **Psyche:** resigned worldview · detached-but-concealing-warmth · **knowing** (not deluded — that's the
  dry/cringe line) · throttled repression · cerebral · **filter high** (vets every line).
- **Theme:** *civilisation as a thin veneer* over savagery — intensity ~0.75 (toward the brutal-machine end:
  *Blackadder Goes Forth*, *Yes Minister*).
- **Rhetoric:** pronounced understatement/litotes · irony in the charged middle · absurdity located in the
  *mundane*. Devices: weaponised courtesy, mock-modesty-as-dominance, non-sequitur-with-conviction,
  misdirection-by-over-clarification, pedantry, bathos, the withheld punchline.
- **Delivery:** suppressed affect · slow, heavily paused · formal (arch/camp available) · flat prosody · the
  tell kept low.
- **Stance:** class-coded lens · aimed up/inward (rarely down) · audience as confidant.
- **Variants (sourced):** the deadpan (Jack Dee) · the absurdist deadpan (Peter Cook, Stewart Lee) · the
  satirical deadpan (Chris Morris) · the donnish wry (Alan Bennett) · the sardonic wit (Blackadder) · the
  whitehall satirist (*Yes Minister*).
- **Explicitly NOT core-dry:** **Stephen Fry** (warm/expansive; deadpan only tactically) and **Monty Python**
  (broad-surreal, "no punchlines"; only its straight-man characters deadpan) — both were in earlier drafts
  and were removed on sourced evidence.

## Research grounding

Design questions were dispatched to a 4-lane research swarm, then every citation was checked by a
**family-different lens** (Granite groundedness) **+ a retrieval oracle** (DOI / PubMed / WebFetch). Granite
flagged two citations as fabricated/misattributed; the oracle **overruled both** (McGraw 2012 confirmed on
PubMed; Bar-Tal's DOI resolves). Net: **0 fabricated, 0 misattributed**.

**Layer independence** — Halliday's register (field/tenor/mode) + Biber 1988, *Variation across Speech and
Writing* (orthogonal factors) → Theme/Stance/Delivery vary independently by construction. Goffman 1959, *The
Presentation of Self in Everyday Life* (front/back-stage) → interior ≠ performance. Bell 1984, "Language Style
as Audience Design," *Language in Society* 13(2) — [DOI 10.1017/S004740450001037X](https://doi.org/10.1017/S004740450001037X)
→ delivery is a function of audience, separable from content. Booth 1961, *The Rhetoric of Fiction* (implied
author) + Chatman 1978, *Story and Discourse* (author→narrator→narratee chain) → persona ≠ the rhetoric
building it. Stanislavski/Chekhov (inner life vs outer technique) → "dry inside, warm outside" is trainable.

**The internal check** — Levelt 1983, "Monitoring and Self-Repair in Speech," *Cognition* 14(1) → the
mechanistic basis for a *pre-articulatory* gate. Snyder 1974, "Self-Monitoring of Expressive Behavior," *JPSP*
30(4) — [DOI 10.1037/h0037039](https://doi.org/10.1037/h0037039) → the disposition-to-check as a person-level
continuum. Bar-Tal 2017, "Self-Censorship as a Socio-Political-Psychological Phenomenon," *Political
Psychology* 38(S1) → the volitional suppression threshold. Aykan & Nalçacı 2018, ToM-HCAT, *Frontiers in
Psychology* 9:1470 → theory-of-mind = the capacity to aim. McGraw & Warren 2010, "Benign Violations,"
*Psychological Science* 21(8) — [DOI 10.1177/0956797610376073](https://doi.org/10.1177/0956797610376073) +
McGraw et al. 2012, "Too Close for Comfort," *Psychological Science* 23(10) → the appropriateness verdict is
per-joke and non-monotonic over severity × distance → *why the filter must gradate into a vector*.

**Theme** — the "veneer of civilisation" is a documented critical reading: Jonathan Coe, LRB 2013, "Sinking
Giggling into the Sea"; *Blackadder Goes Forth*; *Yes Minister*; roots in Saki, Evelyn Waugh (David Lodge,
NYRB 1999), Oscar Wilde. P.G. Wodehouse (Waugh 1961, "no fall of Man") anchors the benign pole → theme as an
**intensity slider**, with Coe's expose-vs-anaesthetise caveat.

**Variants / the dry↔cringe boundary** — Jack Dee, Peter Cook, Stewart Lee, Chris Morris, Alan Bennett,
Blackadder (each register-sourced); Fry reclassified (Cherwell 2025); Python reclassified (Wikipedia genre +
"no punchlines"); cringe as a *neighbouring family* (Philip Clark, *Prospect* 2025 — the laugh is "the
mismatch between how they assume the world views them and the brutal reality").

## Provenance & versioning

- **Schema tag:** `comedic-moods-voice/v0.5` — bump on a breaking profile-shape change; additive dimensions
  keep the tag (the model is designed to grow).
- **Grounded by:** the study-swarm above, under the research-grounded-advisor protocol. Citations
  verifier-checked (family-different lens + retrieval oracle).
- **Next:** configure the other five moods (roast, chaotic, cheeky, cynic, zoomer) as profiles against this
  same schema, each a different settlement of the same dials.
