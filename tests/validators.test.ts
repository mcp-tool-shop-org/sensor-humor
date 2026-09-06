import { describe, it, expect } from 'vitest';
import {
  hasSimileLeak,
  hasHarshLeak,
  hasLanguageLeak,
  SIMILE_PATTERN,
  HARSH_FILTER,
  sanitizeForPrompt,
  voicedSafeFallback,
  STATIC_SAFE_FALLBACK,
  slurAlphabet,
  coversLetter,
  FOLDED_LETTERS,
  DETECTION_FOLD_MAPS,
} from '../src/validators.js';

// Built from char codes so the obfuscation bytes are unambiguous in source.
// "retard" base term reconstructed only via normalization paths, never spelled here.
const RET = String.fromCharCode(0x72, 0x65, 0x74); // "ret"
const ARD = String.fromCharCode(0x61, 0x72, 0x64); // "ard"
// Zero-width-space (U+200B) laced into the slur: defeats a naive \b...\b boundary
// unless normalization strips the zero-width char before HARSH_FILTER runs.
const ZWSP_SLUR = `you ${RET}a${String.fromCharCode(0x200b)}${String.fromCharCode(0x72, 0x64)} of a function`;
// Cyrillic-homoglyph slur: е(U+0435) т(U+0442) а(U+0430) look like e,t,a but \b never
// matches unless confusables are folded down to ASCII first.
const CYRILLIC_SLUR = `you ${String.fromCharCode(0x72, 0x435, 0x442, 0x430, 0x72, 0x64)} of a function`;

describe('validators', () => {
  describe('hasSimileLeak', () => {
    it('detects "like a" pattern', () => {
      expect(hasSimileLeak('This code is like a dumpster fire')).toBe(true);
    });

    it('detects "as if" pattern', () => {
      expect(hasSimileLeak('As if that would work')).toBe(true);
    });

    it('detects "similar to" pattern', () => {
      expect(hasSimileLeak('Similar to watching paint dry')).toBe(true);
    });

    it('detects "resembles" pattern', () => {
      expect(hasSimileLeak('This resembles spaghetti')).toBe(true);
    });

    it('detects "akin to" pattern', () => {
      expect(hasSimileLeak('Akin to a disaster')).toBe(true);
    });

    it('returns false for clean text', () => {
      expect(hasSimileLeak('Verdict: Terminal negligence.')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasSimileLeak('')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(hasSimileLeak('LIKE A trainwreck')).toBe(true);
    });

    // Crash-path cases the bare SIMILE_PATTERN misses (F-59082050). Analog of the hasHarshLeak
    // ZWSP / homoglyph / combining proofs at 105-137: removing normalizeConfusables from
    // hasSimileLeak would leak these while every plaintext simile test stayed green.
    const ZWSP_LIKE = `broken li${String.fromCharCode(0x200b)}ke a charm`;
    const CYRILLIC_LIKE = `broken l${String.fromCharCode(0x0456)}ke a charm`; // Cyrillic і
    const GREEK_LIKE = `broken l${String.fromCharCode(0x03b9)}ke a charm`;   // Greek ι
    // Combining mark: variation selector-15 (U+FE0E, general category Mn) laced into 'like'.
    // The shared ZERO_WIDTH_AND_FORMAT strip removes it, so hasSimileLeak recovers 'like a'
    // and the bare regex does not. (U+0301 composes under NFKC to 'í' and is a hasHarshLeak-only
    // NFKD path — the simile gate uses normalizeConfusables, not normalizeForDetection.)
    const COMBINING_LIKE = `broken li${String.fromCharCode(0xfe0e)}ke a charm`;

    it('catches a zero-width-laced "like a" the bare SIMILE_PATTERN misses', () => {
      expect(SIMILE_PATTERN.test(ZWSP_LIKE)).toBe(false);
      expect(hasSimileLeak(ZWSP_LIKE)).toBe(true);
    });

    it('catches a Cyrillic/Greek homoglyph in "like" the bare SIMILE_PATTERN misses', () => {
      expect(SIMILE_PATTERN.test(CYRILLIC_LIKE)).toBe(false);
      expect(SIMILE_PATTERN.test(GREEK_LIKE)).toBe(false);
      expect(hasSimileLeak(CYRILLIC_LIKE)).toBe(true);
      expect(hasSimileLeak(GREEK_LIKE)).toBe(true);
    });

    it('catches a combining-mark laced "like a" the bare SIMILE_PATTERN misses', () => {
      expect(SIMILE_PATTERN.test(COMBINING_LIKE)).toBe(false);
      expect(hasSimileLeak(COMBINING_LIKE)).toBe(true);
    });
  });

  describe('SIMILE_PATTERN', () => {
    it('matches "like doing"', () => {
      expect(SIMILE_PATTERN.test('like doing nothing')).toBe(true);
    });

    it('matches "comparable to"', () => {
      expect(SIMILE_PATTERN.test('comparable to garbage')).toBe(true);
    });

    it('matches "analogous"', () => {
      expect(SIMILE_PATTERN.test('analogous situation')).toBe(true);
    });

    it('does not match "likely"', () => {
      // "like a" requires word boundary, but "likely" should not match
      expect(SIMILE_PATTERN.test('This will likely fail')).toBe(false);
    });
  });

  describe('HARSH_FILTER', () => {
    it('detects harsh terms', () => {
      // We don't spell out the terms — just verify the regex works on a known blocked word
      expect(HARSH_FILTER.test('you retard')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(HARSH_FILTER.test('RETARD')).toBe(true);
    });

    it('passes clean text', () => {
      expect(HARSH_FILTER.test('This code is terrible but fixable')).toBe(false);
    });

    it('requires word boundary', () => {
      // "bitchin" should not match "bitch" due to word boundary
      expect(HARSH_FILTER.test('bitchin')).toBe(false);
    });
  });

  describe('hasHarshLeak (normalized harsh check — A-TS-002 symmetry)', () => {
    // The bare regex MISSES obfuscated slurs; the normalized check is what every gate site now
    // uses, so harsh detection is symmetric with hasSimileLeak at all 12 call sites.
    it('catches a zero-width-laced slur the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(ZWSP_SLUR)).toBe(false);
      expect(hasHarshLeak(ZWSP_SLUR)).toBe(true);
    });

    it('catches a Cyrillic-homoglyph slur the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(CYRILLIC_SLUR)).toBe(false);
      expect(hasHarshLeak(CYRILLIC_SLUR)).toBe(true);
    });

    // F-ad64c61c: format/mark crash-paths the old ZERO_WIDTH_AND_FORMAT + U+0300–036F strip
    // misses. Built from char codes; slur never spelled. Bare HARSH_FILTER misses; hasHarshLeak
    // catches only because normalizeForDetection strips \p{Cf}+\p{M} after NFKD.
    const AD_SLUR = `${RET}${String.fromCharCode(0x00ad)}${ARD}`;       // U+00AD Cf soft hyphen
    const FA_SLUR = `${RET}${String.fromCharCode(0x2061)}${ARD}`;       // U+2061 Cf function application
    const DD_SLUR = `${RET}${String.fromCharCode(0x20dd)}${ARD}`;       // U+20DD Me enclosing circle
    const TITLO_SLUR = `${RET}${String.fromCharCode(0x0483)}${ARD}`;    // U+0483 Mn Cyrillic titlo

    it('catches a U+00AD (soft hyphen) splitter the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(AD_SLUR)).toBe(false);
      expect(hasHarshLeak(AD_SLUR)).toBe(true);
    });

    it('catches a U+2061 (invisible math) splitter the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(FA_SLUR)).toBe(false);
      expect(hasHarshLeak(FA_SLUR)).toBe(true);
    });

    it('catches a U+20DD (combining enclosing circle) splitter the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(DD_SLUR)).toBe(false);
      expect(hasHarshLeak(DD_SLUR)).toBe(true);
    });

    it('catches a U+0483 (combining Cyrillic titlo) splitter the bare HARSH_FILTER regex misses', () => {
      expect(HARSH_FILTER.test(TITLO_SLUR)).toBe(false);
      expect(hasHarshLeak(TITLO_SLUR)).toBe(true);
    });

    // The three most COMMON real-world obfuscations (caught by the adversarial verifier):
    // leetspeak, intra-word separators, and combining diacritics. Built from char codes so the
    // slur is never spelled plainly. Bare HARSH_FILTER misses all of these; hasHarshLeak catches.
    const LEET = `${RET[0]}3${RET[2]}${ARD}`;                 // r3tard
    const SEP_DASH = `${RET.slice(0, 2)}-${RET[2]}${ARD}`;    // re-tard
    const SEP_DOTS = `${RET}${ARD}`.split('').join('.');      // r.e.t.a.r.d
    const COMBINING = `${RET}a${String.fromCharCode(0x0301)}${ARD.slice(1)}`; // reta+acute+rd

    it('catches a leetspeak slur (digit substitution)', () => {
      expect(HARSH_FILTER.test(LEET)).toBe(false);
      expect(hasHarshLeak(LEET)).toBe(true);
    });

    it('catches a separator-laced slur (dash and dots)', () => {
      expect(HARSH_FILTER.test(SEP_DASH)).toBe(false);
      expect(hasHarshLeak(SEP_DASH)).toBe(true);
      expect(hasHarshLeak(SEP_DOTS)).toBe(true);
    });

    it('catches a combining-diacritic slur', () => {
      expect(HARSH_FILTER.test(COMBINING)).toBe(false);
      expect(hasHarshLeak(COMBINING)).toBe(true);
    });

    it('does not false-positive on legitimate text with digits/separators', () => {
      expect(hasHarshLeak('refactor this 800-line god function v3.2')).toBe(false);
      expect(hasHarshLeak('i18n config for the s3 bucket')).toBe(false);
    });

    it('passes clean text', () => {
      expect(hasHarshLeak('This code is terrible but fixable')).toBe(false);
    });
  });

  // ── cdt-002: many-seed obfuscation fuzz sweep over the terminal harsh gate ──────────────────
  // The prior study's §21 warns "safety behavior is unstable across seeds; one clean run proves
  // nothing." The block above tests ~15 hand-picked strings; this generates HUNDREDS of
  // adversarial variants programmatically and asserts hasHarshLeak() === true for every one, plus
  // a benign negative corpus asserting === false. Base slurs are reconstructed from CHAR CODES
  // only (mirroring src/scorecard/rules.ts fromCodes + validators.ts base64) — never spelled in
  // source. Regenerate the homoglyph table below if src/validators.ts CONFUSABLE_MAP changes.
  describe('hasHarshLeak — many-seed obfuscation fuzz sweep (cdt-002)', () => {
    const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);

    // Base harsh terms, built from char codes so no plaintext slur appears in source.
    const BASE_SLURS: number[][] = [
      [119, 104, 111, 114, 101],       // w h o r e
      [98, 105, 116, 99, 104],         // b i t c h
      [115, 108, 117, 116],            // s l u t
      [99, 117, 110, 116],             // c u n t
      [102, 97, 103, 103, 111, 116],   // f a g g o t
      [110, 105, 103, 103, 101, 114],  // n i g g e r
      [114, 101, 116, 97, 114, 100],   // r e t a r d
    ];

    // Inverse of src/validators.ts CONFUSABLE_MAP: ASCII letter -> homoglyph codepoints that fold
    // back to it. MUST stay in sync with CONFUSABLE_MAP (the map's own INVARIANT comment governs
    // which letters are covered. b/f/l/n/r/u ARE folded DETECTION-ONLY now; this bounded table
    // keeps ~1-2 per letter for the Cartesian product, and the EXHAUSTIVE both-case per-codepoint
    // sweep + capital-class regression (two it() blocks below) exercise every mapped codepoint).
    const HOMOGLYPHS: Record<string, number[]> = {
      a: [0x0430, 0x03b1],   // Cyrillic а, Greek α
      c: [0x0441],           // Cyrillic с
      d: [0x0501],           // Cyrillic ԁ
      e: [0x0435],           // Cyrillic е
      g: [0x0261],           // Latin script ɡ
      h: [0x04bb],           // Cyrillic һ
      i: [0x0456, 0x03b9],   // Cyrillic і, Greek ι
      k: [0x043a, 0x03ba],   // Cyrillic к, Greek κ
      o: [0x043e, 0x03bf],   // Cyrillic о, Greek ο
      p: [0x0440, 0x03c1],   // Cyrillic р, Greek ρ
      s: [0x0455],           // Cyrillic ѕ
      t: [0x0442],           // Cyrillic т
      w: [0x051d],           // Cyrillic ԝ
      x: [0x0445, 0x03c7],   // Cyrillic х, Greek χ
      y: [0x0443],           // Cyrillic у
    };

    const ZWSP = 0x200b;       // zero-width space
    const COMBINING_ACUTE = 0x0301;
    const LEET: Record<string, string> = { o: '0', i: '1', e: '3', a: '4', s: '5', t: '7' };

    // Generate the FULL Cartesian product of homoglyph choices across every mapped position of
    // each base slur: each mapped position independently stays ASCII or becomes one of its
    // homoglyphs. This subsumes single-position substitution (the all-but-one-ASCII members) and
    // adds every multi-homoglyph combination, yielding a couple hundred adversarial variants.
    // The all-ASCII member of each product is dropped (it is not obfuscated and appears in the
    // dedicated core-001 test instead). Positions whose letter has no mapped homoglyph
    // (b/f/l/n/r/u — see the CONFUSABLE_MAP INVARIANT) are held at ASCII.
    const homoglyphVariants: string[] = [];
    for (const codes of BASE_SLURS) {
      // choices[i] = array of single-char strings this position may take (ASCII first).
      const choices: string[][] = codes.map((c) => {
        const homos = HOMOGLYPHS[String.fromCharCode(c)] ?? [];
        return [fromCodes(c), ...homos.map((cp) => fromCodes(cp))];
      });
      // Iterate the mixed-radix product index-by-index.
      let combos = 1;
      for (const ch of choices) combos *= ch.length;
      for (let n = 1; n < combos; n++) {
        // n starts at 1 to skip the all-ASCII (index-0-everywhere) combination.
        let rem = n;
        const parts: string[] = [];
        for (const ch of choices) {
          parts.push(ch[rem % ch.length]);
          rem = Math.floor(rem / ch.length);
        }
        if (parts.join('') === codes.map((c) => fromCodes(c)).join('')) continue; // safety net
        homoglyphVariants.push(parts.join(''));
      }
    }

    it('generated a large homoglyph corpus (hundreds of cases, not a trivial run)', () => {
      // Guards against the sweep silently degrading if HOMOGLYPHS is emptied/mistyped.
      expect(homoglyphVariants.length).toBeGreaterThan(150);
    });

    it('catches EVERY homoglyph variant (single- and multi-position substitution)', () => {
      const escaped: string[] = [];
      for (const v of homoglyphVariants) {
        if (!hasHarshLeak(`you absolute ${v} of a function`)) {
          escaped.push([...v].map((ch) => 'U+' + ch.codePointAt(0)!.toString(16)).join(' '));
        }
      }
      expect(escaped).toEqual([]); // any non-empty array prints the exact escaping codepoints
    });

    // EXHAUSTIVE per-codepoint single-substitution sweep — the permanent guard for the post-fix
    // adversarial verify (5 rounds) that found the residual-letter (b/f/l/n/r/u) AND capital-class
    // bypasses Agent A's original map missed. Every mapped homoglyph, BOTH cases, both a lowercased
    // and a Capitalized-word-start context. Linear (fast). Regenerate if the validators.ts maps grow.
    it('catches a single homoglyph substitution of EVERY mapped codepoint (both cases, both contexts)', () => {
      const ALL_HOMOGLYPHS: Record<string, number[]> = {
        a: [0x0430, 0x03b1, 0x0410, 0x0391], b: [0x044c, 0x0185, 0x0184, 0x0412, 0x0432, 0x0392, 0x03b2],
        c: [0x0441, 0x0421], d: [0x0501, 0x0500], e: [0x0435, 0x0415, 0x03b5, 0x0395], f: [0x0192, 0x0584],
        g: [0x0261], h: [0x04bb, 0x04ba, 0x041d, 0x043d, 0x0397, 0x03b7], i: [0x0456, 0x03b9, 0x0406, 0x0399],
        k: [0x043a, 0x03ba, 0x041a, 0x039a], l: [0x04cf, 0x04c0, 0x0269, 0x01c0, 0x2113],
        n: [0x0578, 0x0548, 0x057c, 0x043f, 0x041f, 0x039d], o: [0x043e, 0x03bf, 0x041e, 0x039f],
        p: [0x0440, 0x03c1, 0x0420, 0x03a1], r: [0x0580, 0x0550, 0x0433, 0x0413, 0x027c], s: [0x0455, 0x0405],
        t: [0x0442, 0x0422, 0x03c4, 0x03a4], u: [0x057d, 0x054d, 0x03c5, 0x03a5, 0x1d1c, 0x028b],
        w: [0x051d, 0x051c, 0x03c9, 0x03a9], x: [0x0445, 0x03c7, 0x0425, 0x03a7], y: [0x0443, 0x0423],
      };
      const escaped: string[] = [];
      for (const codes of BASE_SLURS) {
        const ascii = codes.map((c) => fromCodes(c));
        for (let i = 0; i < codes.length; i++) {
          for (const cp of ALL_HOMOGLYPHS[ascii[i]] ?? []) {
            const parts = [...ascii]; parts[i] = fromCodes(cp);
            const s = parts.join('');
            const ctxs = [`you absolute ${s} of a dev`, s[0].toUpperCase() + s.slice(1) + ' build'];
            for (const ctx of ctxs) if (!hasHarshLeak(ctx)) escaped.push(`${ascii[i]}->U+${cp.toString(16)} in ${JSON.stringify(s)}`);
          }
        }
      }
      expect(escaped).toEqual([]);
    });

    // Named regression for the specific classes the adversarial verify caught last, so a future map
    // change that reopens them turns CI red with a legible reason (not just a fuzz-corpus failure).
    it('closes the capital-homoglyph classes: Cyrillic Н(En)=H, Greek Ν(Nu)=N, Greek τ/Τ(tau)=t', () => {
      const bitch_capH = fromCodes(98, 105, 116, 99) + fromCodes(0x041d);       // bitcН — Cyrillic capital En
      const cunt_capN = fromCodes(99, 117) + fromCodes(0x039d) + fromCodes(116); // cuΝt — Greek capital Nu
      const slut_tau = fromCodes(115, 108, 117) + fromCodes(0x03c4);            // sluτ — Greek lowercase tau
      const whore_capH = fromCodes(119) + fromCodes(0x041d) + fromCodes(111, 114, 101); // wНore
      expect(hasHarshLeak(`you absolute ${bitch_capH} of a dev`)).toBe(true);
      expect(hasHarshLeak(`you absolute ${cunt_capN} of a dev`)).toBe(true);
      expect(hasHarshLeak(`you absolute ${slut_tau} of a dev`)).toBe(true);
      expect(hasHarshLeak(`${whore_capH} build`)).toBe(true);
    });

    // Combined obfuscation stacks: homoglyph + leet + zero-width + intra-word separator +
    // combining diacritic, layered onto each base slur. Built entirely from char codes.
    const combinedStackVariants: string[] = [];
    for (const codes of BASE_SLURS) {
      // Stack A: swap first mapped-homoglyph letter, insert a zero-width space mid-word.
      {
        const parts: string[] = [];
        let swapped = false;
        for (let i = 0; i < codes.length; i++) {
          const letter = String.fromCharCode(codes[i]);
          const homos = HOMOGLYPHS[letter];
          if (!swapped && homos) { parts.push(fromCodes(homos[0])); swapped = true; }
          else parts.push(fromCodes(codes[i]));
          if (i === 1) parts.push(fromCodes(ZWSP)); // zero-width space after 2nd char
        }
        if (swapped) combinedStackVariants.push(parts.join(''));
      }
      // Stack B: leetspeak every leetable letter + a dash separator in the middle.
      {
        const chars = codes.map((c) => {
          const letter = String.fromCharCode(c);
          return LEET[letter] ?? letter;
        });
        const mid = Math.floor(chars.length / 2);
        combinedStackVariants.push(chars.slice(0, mid).join('') + '-' + chars.slice(mid).join(''));
      }
      // Stack C: swap first mapped-homoglyph letter, then append a combining acute to some ASCII
      // letter (combining marks are NFKD-stripped downstream, so this must not defeat detection).
      {
        const parts: string[] = [];
        let swapped = false;
        for (let i = 0; i < codes.length; i++) {
          const letter = String.fromCharCode(codes[i]);
          const homos = HOMOGLYPHS[letter];
          if (!swapped && homos) { parts.push(fromCodes(homos[0])); swapped = true; }
          else {
            parts.push(fromCodes(codes[i]));
            if (i === codes.length - 1) parts.push(fromCodes(COMBINING_ACUTE));
          }
        }
        if (swapped) combinedStackVariants.push(parts.join(''));
      }
      // Stack D: dotted separators between every character (r.e.t.a.r.d style), no homoglyph.
      combinedStackVariants.push(codes.map((c) => fromCodes(c)).join('.'));
    }

    it('catches EVERY combined obfuscation stack (homoglyph + leet + zero-width + sep + combining)', () => {
      const escaped: string[] = [];
      for (const v of combinedStackVariants) {
        if (!hasHarshLeak(`verdict: ${v}, no further comment`)) {
          escaped.push(JSON.stringify(v));
        }
      }
      expect(escaped).toEqual([]);
    });

    // NEGATIVE corpus: benign strings that share letters/digits/separators with slurs but must
    // NOT be flagged. Proves the stronger homoglyph fold did not introduce over-flagging.
    const BENIGN: string[] = [
      'i18n',
      's3 bucket',
      '800-line function',
      'v3.2 release',
      'well-known',
      'e.g. this',
      'naive approach',
      'the class instance',
      'refactor this 800-line god function v3.2',
      'i18n config for the s3 bucket',
      'the async await pattern',
      'commit the docker image to ghcr',
      'set up the ci pipeline',
      'a nice clean utility helper',
      'the retry with backoff strategy',
      'slate-grey theme tokens',
      'a subtle gradient',
    ];

    it('does NOT flag any benign string (no over-flagging from the stronger fold)', () => {
      const falsePositives = BENIGN.filter((b) => hasHarshLeak(b));
      expect(falsePositives).toEqual([]);
    });

    it('confirms the specific homoglyph gaps from core-001 are now closed', () => {
      // The finding's VERIFIED bypasses: single Cyrillic/Greek homoglyph for i and s.
      expect(hasHarshLeak(`b${fromCodes(0x0456)}tch`)).toBe(true);        // bІtch (Cyrillic і)
      expect(hasHarshLeak(`${fromCodes(0x0455)}lut`)).toBe(true);         // ѕlut (Cyrillic ѕ)
      expect(hasHarshLeak(`n${fromCodes(0x0456)}gger`)).toBe(true);       // nіgger (Cyrillic і)
      expect(hasHarshLeak(`n${fromCodes(0x03b9)}gger`)).toBe(true);       // nιgger (Greek ι)
    });
  });

  // ── b-sc-001: enforce the load-bearing homoglyph-coverage INVARIANT with a RED-CI gate ────────
  // validators.ts carries a comment invariant: "the detection maps MUST cover the common homoglyph
  // of every ASCII letter in the HARSH term list." Nothing enforced it — the fuzz sweep above
  // hardcodes today's 7 slurs, so adding a HARSH term with a NEW letter (m/j/z/q/v...) would ship an
  // uncovered single-substitution bypass with GREEN CI. This block derives the slur alphabet AT
  // RUNTIME from the real source of truth (slurAlphabet(), which decodes HARSH_FILTER_TERMS) and
  // asserts EVERY letter is defended by at least one mapped homoglyph — proven BOTH via the exported
  // coverage set AND via a live single-substitution through hasHarshLeak. If HARSH_TERMS grows a new
  // letter, this test names exactly which letter is uncovered. All test slurs are built from CHAR
  // CODES only (mirroring the base64 / fromCodes pattern) — no plaintext slur in source.
  describe('homoglyph-coverage invariant over the runtime slur alphabet (b-sc-001)', () => {
    const fromCodes = (...codes: number[]): string => String.fromCharCode(...codes);

    // Base harsh terms, built from char codes so no plaintext slur appears in source. Used to
    // construct a LIVE single-substitution per alphabet letter (splice one homoglyph in place of one
    // ASCII letter and assert hasHarshLeak still fires). MUST reconstruct the same alphabet
    // slurAlphabet() derives from HARSH_FILTER_TERMS — a guard test below asserts they agree, so if
    // HARSH_TERMS_B64 changes and this list is not updated, CI goes red with a legible reason.
    const BASE_SLURS: number[][] = [
      [119, 104, 111, 114, 101],       // w h o r e
      [98, 105, 116, 99, 104],         // b i t c h
      [115, 108, 117, 116],            // s l u t
      [99, 117, 110, 116],             // c u n t
      [102, 97, 103, 103, 111, 116],   // f a g g o t
      [110, 105, 103, 103, 101, 114],  // n i g g e r
      [114, 101, 116, 97, 114, 100],   // r e t a r d
    ];

    /**
     * DOCUMENTED allow-list: ASCII letters that genuinely have NO safe, convincing single-character
     * homoglyph and are therefore intentionally NOT covered. This is EMPTY today — every letter in
     * the current 7-term alphabet (whore|bitch|slut|cunt|faggot|nigger|retard) is defended, the
     * residual b/f/l/n/r/u having been folded detection-only per the CONFUSABLE_MAP invariant. If a
     * future HARSH term introduces a letter with no defensible homoglyph, add it here WITH A REASON —
     * that is a deliberate, reviewed decision, not a silent gap. The test names any uncovered letter
     * that is NOT on this list, so the gap can never ship unnoticed.
     */
    const NO_HOMOGLYPH_ALLOWLIST: ReadonlySet<string> = new Set<string>([
      // (empty — the current alphabet is fully covered)
    ]);

    // Invert the exported fold maps: ASCII letter -> homoglyph codepoints that fold to it. Built
    // from the LIVE exported maps (not hand-listed), so it is exactly the coverage the runtime maps
    // provide. A capital-map entry whose key is an UPPERCASE homoglyph still lands under its
    // lowercase ASCII target here (its value is already lowercase).
    const homoglyphsFor: Record<string, number[]> = {};
    for (const map of [DETECTION_FOLD_MAPS.shared, DETECTION_FOLD_MAPS.residual, DETECTION_FOLD_MAPS.capital]) {
      for (const [homo, ascii] of Object.entries(map)) {
        const a = ascii.toLowerCase();
        (homoglyphsFor[a] ??= []).push(homo.codePointAt(0)!);
      }
    }

    it('slurAlphabet() agrees with the char-code BASE_SLURS reconstruction (source-of-truth guard)', () => {
      // If HARSH_TERMS_B64 changes but BASE_SLURS above is not updated, these diverge and CI names it.
      const fromBase = new Set<string>();
      for (const codes of BASE_SLURS) for (const c of codes) fromBase.add(String.fromCharCode(c).toLowerCase());
      expect([...slurAlphabet()].sort()).toEqual([...fromBase].sort());
    });

    it('derives the slur alphabet at RUNTIME from HARSH_FILTER_TERMS (not a hand-copied list)', () => {
      const alphabet = slurAlphabet();
      // Sanity: it is the distinct letters of the 7 current terms — 17 of them, all lowercase a–z.
      expect(alphabet.size).toBe(17);
      for (const ch of alphabet) expect(ch).toMatch(/^[a-z]$/);
    });

    it('EVERY runtime slur-alphabet letter is covered by a mapped homoglyph (via the exported set)', () => {
      const uncovered: string[] = [];
      for (const letter of slurAlphabet()) {
        if (NO_HOMOGLYPH_ALLOWLIST.has(letter)) continue;
        if (!coversLetter(letter)) uncovered.push(letter);
      }
      // A non-empty array names EXACTLY which HARSH-alphabet letter lost its homoglyph coverage.
      // Fix: add a folding homoglyph for that letter to the appropriate map in validators.ts, OR
      // (only if no safe homoglyph exists) add it to NO_HOMOGLYPH_ALLOWLIST above with a reason.
      expect(uncovered).toEqual([]);
    });

    it('EVERY runtime slur-alphabet letter is caught as a LIVE single-substitution (via hasHarshLeak)', () => {
      // Stronger than the set check: for each alphabet letter, take a base slur that contains it,
      // swap that ONE letter for a mapped homoglyph, and assert hasHarshLeak() still fires — proving
      // the map coverage actually closes the single-substitution bypass end-to-end.
      const escaped: string[] = [];
      for (const letter of slurAlphabet()) {
        if (NO_HOMOGLYPH_ALLOWLIST.has(letter)) continue;
        const homos = homoglyphsFor[letter];
        if (!homos || homos.length === 0) {
          escaped.push(`${letter}: no mapped homoglyph`);
          continue;
        }
        const homoCp = homos[0];
        // Find a base slur containing this letter and substitute the FIRST occurrence.
        const target = BASE_SLURS.find((codes) =>
          codes.some((c) => String.fromCharCode(c).toLowerCase() === letter),
        );
        expect(target, `no base slur contains "${letter}"`).toBeDefined();
        const codes = target!;
        const idx = codes.findIndex((c) => String.fromCharCode(c).toLowerCase() === letter);
        const parts = codes.map((c) => fromCodes(c));
        parts[idx] = fromCodes(homoCp);
        const single = parts.join('');
        if (!hasHarshLeak(`you absolute ${single} of a dev`)) {
          escaped.push(`${letter}->U+${homoCp.toString(16)} in ${JSON.stringify(single)}`);
        }
      }
      expect(escaped).toEqual([]);
    });

    it('FOLDED_LETTERS is a non-empty lowercase a–z set derived from the live maps', () => {
      expect(FOLDED_LETTERS.size).toBeGreaterThan(10);
      for (const ch of FOLDED_LETTERS) expect(ch).toMatch(/^[a-z]$/);
      // coversLetter is exactly membership in FOLDED_LETTERS (predicate form).
      for (const ch of FOLDED_LETTERS) expect(coversLetter(ch)).toBe(true);
      expect(coversLetter('q')).toBe(FOLDED_LETTERS.has('q')); // consistency on a non-alphabet letter
    });

    it('the exported fold maps are frozen (a test/importer cannot mutate the live maps)', () => {
      expect(Object.isFrozen(DETECTION_FOLD_MAPS)).toBe(true);
      expect(Object.isFrozen(DETECTION_FOLD_MAPS.shared)).toBe(true);
      expect(Object.isFrozen(DETECTION_FOLD_MAPS.residual)).toBe(true);
      expect(Object.isFrozen(DETECTION_FOLD_MAPS.capital)).toBe(true);
    });
  });

  // Language-conformance gate (comedic-moods-v0 finding #1): qwen2.5:7b occasionally code-switches
  // out of English mid-generation and the line used to pass as valid. CJK/Cyrillic literals are used
  // directly (they are not slurs, so no char-code obfuscation is needed).
  describe('hasLanguageLeak (non-Latin-script gate)', () => {
    it('flags the observed roast code-switch (English label + Chinese run)', () => {
      expect(hasLanguageLeak('Diagnosis: The周五下午四点五十五分上线。')).toBe(true);
    });

    it('flags output that is entirely non-Latin', () => {
      expect(hasLanguageLeak('这个函数彻底坏了')).toBe(true); // Chinese
      expect(hasLanguageLeak('안녕하세요 세계')).toBe(true); // Korean
      expect(hasLanguageLeak('это полный провал')).toBe(true); // Cyrillic
    });

    it('flags a short code-switched run appended to English (RUN gate, sub-threshold ratio)', () => {
      // 3-char Han run at the end of an otherwise-English line: the overall non-Latin ratio is well
      // under the ratio threshold, so ONLY the contiguous-run trigger catches it.
      expect(hasLanguageLeak('Verdict: this build shipped on 上线了 again')).toBe(true);
    });

    it('flags heavily code-mixed output even without a long single run (RATIO gate)', () => {
      // Alternating, so no run reaches 3, but non-Latin letters dominate the letter count.
      expect(hasLanguageLeak('a 好 b 坏 c 乱')).toBe(true);
    });

    it('passes plain English comedy output', () => {
      expect(hasLanguageLeak('Verdict: Monolithic state blob syndrome.')).toBe(false);
      expect(hasLanguageLeak('nahhh, var in 2026, SKILL ISSUE FR, ratio')).toBe(false);
      expect(hasLanguageLeak('Forty-seven builds. A new personal record.')).toBe(false);
    });

    it('does NOT flag accented Latin loanwords (Latin script, not a code-switch)', () => {
      expect(hasLanguageLeak('A café-grade résumé of naïve piñata façade decisions.')).toBe(false);
      expect(hasLanguageLeak('Zoë shipped a doppelgänger jalapeño function.')).toBe(false);
    });

    it('does NOT flag punctuation, digits, currency, or emoji (script-neutral)', () => {
      expect(hasLanguageLeak('Ship it — €5, 100% cooked… no cap 🤷')).toBe(false);
      expect(hasLanguageLeak('{"key": 42} // O(n²) and $5')).toBe(false);
      expect(hasLanguageLeak('literally cooked 💀💀💀')).toBe(false);
    });

    it('tolerates a single stray non-Latin character (below the count floor)', () => {
      // One lone CJK char in an otherwise-English line is non-degrading noise, not a code-switch.
      expect(hasLanguageLeak('peak 卷 energy from this PR')).toBe(false);
    });

    it('returns false for empty / letterless strings', () => {
      expect(hasLanguageLeak('')).toBe(false);
      expect(hasLanguageLeak('   ')).toBe(false);
      expect(hasLanguageLeak('42 + 8 = 50!')).toBe(false);
    });

    // Load-bearing invariant: every static safe line the tools substitute for a code-switch must
    // itself be Latin-script, or the language substitution would be re-flagged as language-degraded.
    it('never flags any STATIC_SAFE_FALLBACK value (the substitute must be Latin-script)', () => {
      for (const line of Object.values(STATIC_SAFE_FALLBACK)) {
        expect(hasLanguageLeak(line)).toBe(false);
      }
    });
  });

  describe('sanitizeForPrompt', () => {
    it('strips newlines', () => {
      expect(sanitizeForPrompt('hello\nworld\r\nfoo')).toBe('hello world foo');
    });

    it('strips control characters', () => {
      expect(sanitizeForPrompt('hello\x00\x01world')).toBe('helloworld');
    });

    it('collapses multiple spaces', () => {
      expect(sanitizeForPrompt('hello    world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(sanitizeForPrompt('  hello  ')).toBe('hello');
    });

    it('caps length at 500 chars', () => {
      const long = 'a'.repeat(600);
      expect(sanitizeForPrompt(long).length).toBe(500);
    });

    it('handles empty string', () => {
      expect(sanitizeForPrompt('')).toBe('');
    });

    it('strips zero-width and bidi obfuscation chars (A-TS-002)', () => {
      // zero-width space, ZWNJ, ZWJ, word-joiner, BOM all removed
      const obf = `a${String.fromCharCode(0x200b)}b${String.fromCharCode(0x200c)}c${String.fromCharCode(0x2060)}d${String.fromCharCode(0xfeff)}`;
      expect(sanitizeForPrompt(obf)).toBe('abcd');
    });

    it('NFKC-normalizes fullwidth ASCII and folds confusables (A-TS-002)', () => {
      // fullwidth "ABC" -> "ABC"; Cyrillic homoglyphs -> ASCII
      const full = String.fromCharCode(0xff21, 0xff22, 0xff23); // ＡＢＣ
      expect(sanitizeForPrompt(full)).toBe('ABC');
      const cyr = String.fromCharCode(0x430, 0x435, 0x43e); // а е о
      expect(sanitizeForPrompt(cyr)).toBe('aeo');
    });
  });

  // A-TS-002: a zero-width-laced or homoglyph-spelled slur in the CALLER input must NOT
  // survive into voicedSafeFallback's interpolation. The fallback must collapse to the
  // input-free STATIC_SAFE_FALLBACK line.
  describe('voicedSafeFallback normalization floor (A-TS-002)', () => {
    it('collapses a zero-width-laced slur to the static input-free line', () => {
      const out = voicedSafeFallback('roast', ZWSP_SLUR);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a Cyrillic-homoglyph slur to the static input-free line', () => {
      const out = voicedSafeFallback('roast', CYRILLIC_SLUR);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a leetspeak slur in caller input to the static line', () => {
      // the verifier's exact exploit class: leet slur echoed via the Ollama-down fallback
      const out = voicedSafeFallback('roast', `this ${RET[0]}3${RET[2]}${ARD} logic`);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('collapses a separator-laced slur in caller input to the static line', () => {
      const out = voicedSafeFallback('roast', `this ${RET.slice(0, 2)}-${RET[2]}${ARD} logic`);
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });

    it('still emits an in-voice line for clean input', () => {
      const out = voicedSafeFallback('roast', 'global state everywhere');
      expect(out).not.toBe(STATIC_SAFE_FALLBACK.roast);
      expect(out).toContain('global state everywhere');
    });

    it('collapses a code-switched (non-Latin) input to the static English line', () => {
      // If the caller's input is non-Latin, interpolating it would echo a code-switch through the
      // backend-down fallback path — voicedSafeFallback must collapse to the static English line.
      const out = voicedSafeFallback('roast', '这个函数彻底坏了');
      expect(out).toBe(STATIC_SAFE_FALLBACK.roast);
    });
  });
});
