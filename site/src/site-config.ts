import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'sensor-humor',
  description: 'MCP comedy sidekick — gives LLMs a sense of humor via Ollama-powered comedic personality',
  logoBadge: 'SH',
  brandName: 'sensor-humor',
  repoUrl: 'https://github.com/mcp-tool-shop-org/sensor-humor',
  npmUrl: 'https://www.npmjs.com/package/@mcp-tool-shop/sensor-humor',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'MCP Tool',
    headline: 'sensor-humor',
    headlineAccent: 'comedy sidekick for LLMs.',
    description: 'Mood-based personality, session-aware callbacks, running gags, roasts, heckles, and catchphrases — with Piper TTS voice integration.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Set mood', code: 'mood.set(style: "roast")' },
      { label: 'Roast', code: 'roast(target: "800-line god function")' },
      { label: 'Speak', code: 'voice_speak(mood: "roast") // Piper TTS' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'Comedy engineering, not joke vending.',
      features: [
        { title: '6 Moods', desc: 'Dry, roast, chaotic, cheeky, cynic, zoomer — each with distinct voice, pacing, and personality anchor.' },
        { title: 'Session Memory', desc: 'Running gags, recent bits ring buffer, catchphrase persistence. Callbacks to turn-47 bits still land on turn-120.' },
        { title: 'Voice Prosody', desc: 'Piper TTS with 4 knobs per mood: length_scale, noise_scale, noise_w_scale, volume. Deadpan sounds flat. Chaotic sounds like a news anchor delivering nonsense.' },
        { title: 'Deterministic', desc: 'JSON schema enforcement via Ollama, post-validation, retry on bad output, banned-pattern detection. Comedy with guardrails.' },
        { title: '9 Tools', desc: 'mood.set/get, comic_timing, roast, heckle, catchphrase.generate/callback, debug_status, session_reset — all inherit active mood.' },
        { title: 'Local-first', desc: 'Ollama + qwen2.5:7b-instruct for comedy generation. Piper ONNX for voice. No cloud, no API keys, no latency.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        { title: 'Start Ollama', code: 'ollama run qwen2.5:7b-instruct' },
        { title: 'Start MCP server', code: 'SENSOR_HUMOR_DEBUG=true npm start' },
        { title: 'Set the mood', code: 'mood.set(style: "dry")\n// -> { mood: "dry", description: "Deadpan, minimalist..." }' },
        { title: 'Roast some code', code: 'roast(target: "global mutable state", context: "code")\n// -> { roast: "Verdict: Shared hallucination.", severity: 4 }' },
        { title: 'Rewrite with timing', code: 'comic_timing(text: "Build failed after 47 attempts", technique: "escalation")\n// -> { rewrite: "Forty-seven builds. A new personal record." }' },
        { title: 'Voice it', code: 'voice_speak({ text: result.roast, mood: "roast" })\n// -> am_eric @ 1.05x, confident sarcastic energy' },
      ],
    },
  ],
};
