/**
 * sensor-humor shared types
 */

export const MOOD_STYLES = [
  'dry',
  'roast',
  'absurdist',
  'wholesome',
  'sardonic',
  'unhinged',
] as const;

export type MoodStyle = (typeof MOOD_STYLES)[number];

export const DEFAULT_MOOD: MoodStyle = 'dry';

export const MOOD_DESCRIPTIONS: Record<MoodStyle, string> = {
  dry: 'Deadpan, minimalist, says the obvious like it\'s devastating news',
  roast: 'Affectionate but pointed, never cruel, always punches up or at shared human frailty',
  absurdist: 'Logic breaks, non-sequiturs, sudden reality warps, escalation to cartoon physics',
  wholesome: 'Self-deprecating dad energy, warm misdirection, "we\'re all idiots here and it\'s okay"',
  sardonic: 'Weary, seen-it-all, "of course it failed, what did you expect from reality?"',
  unhinged: 'High-energy chaos, spiraling tangents, pretends to lose composure',
};

export const COMIC_TECHNIQUES = [
  'rule-of-three',
  'misdirection',
  'escalation',
  'callback',
  'understatement',
  'auto',
] as const;

export type ComicTechnique = (typeof COMIC_TECHNIQUES)[number];

export const ROAST_CONTEXTS = ['code', 'error', 'idea', 'situation'] as const;

export type RoastContext = (typeof ROAST_CONTEXTS)[number];

// --- Session state ---

export interface RunningGag {
  setup: string;
  tag: string;
  used: number;
  last_turn: number;
}

export interface RecentBit {
  text: string;
  turn: number;
  technique: string;
}

export interface SensorHumorSession {
  mood: MoodStyle;
  running_gags: RunningGag[];
  recent_bits: RecentBit[]; // ring buffer, max 20
  catchphrases: Map<string, number>; // phrase → use count
  turn_counter: number;
}

// --- Tool return types ---

export interface MoodSetResult {
  mood: MoodStyle;
  description: string;
  voice_notes: string;
}

export interface MoodGetResult {
  mood: MoodStyle;
  description: string;
  session_gag_count: number;
}

export interface ComicTimingResult {
  rewrite: string;
  technique_used: string;
  callback_source?: string;
}

export interface RoastResult {
  roast: string;
  severity: number;
  mood: MoodStyle;
}

export interface HeckleResult {
  heckle: string;
  mood: MoodStyle;
}

export interface CatchphraseGenerateResult {
  phrase: string;
  is_fresh: boolean;
}

export interface CatchphraseCallbackResult {
  phrase: string;
  use_count: number;
}

export interface GenerationMetadata {
  model: string;
  temperature: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
}
