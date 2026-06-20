/**
 * sensor-humor shared types
 */

export const MOOD_STYLES = [
  'dry',
  'roast',
  'chaotic',
  'cheeky',
  'cynic',
  'zoomer',
] as const;

export type MoodStyle = (typeof MOOD_STYLES)[number];

export const DEFAULT_MOOD: MoodStyle = 'dry';

export const MOOD_DESCRIPTIONS: Record<MoodStyle, string> = {
  dry: 'Deadpan, minimalist, says the obvious like it\'s devastating news',
  roast: 'Affectionate but pointed, never cruel, always punches up or at shared human frailty',
  chaotic: 'Starts normal, one big absurd twist, escalates into nonsense delivered as fact',
  cheeky: 'Playful teasing, affectionate mischief, gentle mockery with a wink',
  cynic: 'Bitter, jaded, quietly vicious realism — of course it failed',
  zoomer: 'Terminally online Gen-Z snark, savage one-liners, meme-adjacent energy',
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

/**
 * Degradation signal carried on every comedy result. Present (true) only when the output is
 * NOT a genuine model generation: either the Ollama backend failed (degraded_reason is the
 * classified error code) or the safety filter had to substitute a canned line
 * (degraded_reason: 'safety-filter'). Absent on the happy path, so existing callers are
 * unaffected and the absence of the flag is a positive signal of a real generation.
 */
export interface Degradable {
  degraded?: boolean;
  degraded_reason?: string;
}

export interface ComicTimingResult extends Degradable {
  rewrite: string;
  technique_used: string;
  callback_source?: string;
}

export interface RoastResult extends Degradable {
  roast: string;
  severity: number;
  mood: MoodStyle;
}

export interface HeckleResult extends Degradable {
  heckle: string;
  mood: MoodStyle;
}

export interface CatchphraseGenerateResult extends Degradable {
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
