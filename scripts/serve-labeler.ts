/**
 * DEV SERVER (local): serve the comedic-moods crowd labeler + its two API seams.
 *
 * This is the backend the browser labeler talks to — the swap-in for the HTML's stubbed
 * `loadNextTuple()` / `submitJudgment()`. It serves an app HTML (or a built-in functional preview),
 * active-selects the next BWS tuple per rater, and ingests judgments append-only into a crowd anchor
 * JSONL (contract-validated) with the research `meta` to a parallel sidecar.
 *
 * ⚠ DEV / LOCAL ONLY. Permissive CORS, no auth, no rate-limit, client-supplied rater id. A public
 * deployment must add rate-limiting, abuse protection, server-side rater/session tokens, and HTTPS.
 *
 * Endpoints:
 *   GET  /                       the app (from --app), else the built-in preview
 *   GET  /api/next?rater=&mood=  → a Round DTO, or { done: true } when the rater's frontier is exhausted
 *   POST /api/judgment           body { judgment, meta? } → { ok, flagged? } | 400 { ok:false, issues }
 *   GET  /api/rankings?mood=     → live BWS + Bradley-Terry ranking for a mood (crowd convergence view)
 *   GET  /api/health             → pool + progress stats
 *
 * Usage:
 *   npx tsx scripts/serve-labeler.ts <corpus-or-enriched.jsonl>
 *        [--app <labeler.html>]        the Claude Design HTML to serve at / (else a built-in preview)
 *        [--anchor <file>]             append-only crowd anchor (default <base>.crowd-anchor.jsonl)
 *        [--meta <file>]               research sidecar     (default <base>.crowd-meta.jsonl)
 *        [--port <n>]                  default 8787; 0 = OS-assigned (printed on startup)
 *        [--k <n>]                     tuple size (default 4)
 *        [--honeypot <id,id,...>]      line ids that are canned/degraded controls (BEST on one flags QC)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MOOD_STYLES, type MoodStyle } from '../src/types.js';
import { judgmentRecordToBws } from '../src/dataset/label/schema.js';
import { validateBwsJudgmentsJsonl } from '../src/dataset/label/validate.js';
import {
  tupleKey,
  bwsCountScores,
  fitBradleyTerry,
  judgmentsToPairs,
  findIntransitiveTriples,
  type BwsJudgment,
} from '../src/dataset/label/bws.js';
import { buildLinePool, nextRound, validateJudgment, isHoneypotBest } from '../src/dataset/label/serve-core.js';

function usage(msg: string): never {
  console.error(msg);
  console.error('usage: tsx scripts/serve-labeler.ts <corpus.jsonl> [--app <html>] [--anchor <file>] [--meta <file>] [--port <n>] [--k <n>] [--honeypot <ids>]');
  process.exit(2);
}

// --- argv ------------------------------------------------------------------
const args = process.argv.slice(2);
let input: string | undefined;
let appFile: string | undefined;
let anchorFile: string | undefined;
let metaFile: string | undefined;
let port = 8787;
let k = 4;
let honeypotIds = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--app') appFile = args[++i];
  else if (a === '--anchor') anchorFile = args[++i];
  else if (a === '--meta') metaFile = args[++i];
  else if (a === '--port') port = parseInt(args[++i], 10);
  else if (a === '--k') {
    k = parseInt(args[++i], 10);
    if (!Number.isInteger(k) || k < 2) usage('--k must be an integer >= 2');
  } else if (a === '--honeypot') honeypotIds = new Set((args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  else if (a.startsWith('--')) usage(`unknown flag '${a}'`);
  else if (input === undefined) input = a;
  else usage(`unexpected extra argument '${a}'`);
}
if (input === undefined) usage('missing <corpus-or-enriched.jsonl>');
if (!Number.isInteger(port) || port < 0) usage('--port must be a non-negative integer');
const anchor = anchorFile ?? `${input.replace(/\.jsonl$/i, '')}.crowd-anchor.jsonl`;
const meta = metaFile ?? `${input.replace(/\.jsonl$/i, '')}.crowd-meta.jsonl`;

// --- state (loaded at boot, mutated on ingest) -----------------------------
let corpusText: string;
try {
  corpusText = readFileSync(input, 'utf-8');
} catch (e) {
  usage(`cannot read ${input}: ${(e as Error).message}`);
}
const pool = buildLinePool(corpusText);
if (pool.size === 0) usage('no valid rows in corpus (need valid:true rows with a known mood + non-empty output)');

const textById = new Map<string, string>();
for (const lines of pool.values()) for (const l of lines) textById.set(l.id, l.text);

const judgmentsByMood = new Map<MoodStyle, BwsJudgment[]>();
for (const m of MOOD_STYLES) judgmentsByMood.set(m, []);
const seenByRater = new Map<string, Set<string>>();
const raterOf = (r: string | undefined): string => r ?? 'anon';
function remember(rater: string, tKey: string): void {
  const s = seenByRater.get(rater) ?? new Set<string>();
  s.add(tKey);
  seenByRater.set(rater, s);
}

// Resume: replay the existing crowd anchor into memory (aggregate judgments + per-rater seen keys).
if (existsSync(anchor)) {
  const prev = validateBwsJudgmentsJsonl(readFileSync(anchor, 'utf-8'));
  if (prev.invalid > 0) console.error(`  warning: ${prev.invalid} existing anchor line(s) failed the contract and were ignored`);
  for (const rec of prev.records) {
    judgmentsByMood.get(rec.mood)!.push(judgmentRecordToBws(rec));
    remember(raterOf(rec.rater), tupleKey(rec.line_ids));
  }
}

function appendLine(file: string, obj: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(obj) + '\n', 'utf-8'); // append-only: prior judgments are never at risk
}

// --- http helpers ----------------------------------------------------------
function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*'); // dev only
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJson(res: ServerResponse, code: number, body: unknown): void {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
function readBody(req: IncomingMessage, limit = 65_536): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// --- routes ----------------------------------------------------------------
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return void res.end();
  }

  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return void res.end(appHtml());
  }

  if (req.method === 'GET' && path === '/api/health') {
    const counts: Record<string, { lines: number; judgments: number }> = {};
    for (const m of MOOD_STYLES) counts[m] = { lines: pool.get(m)?.length ?? 0, judgments: judgmentsByMood.get(m)!.length };
    return sendJson(res, 200, { ok: true, k, raters: seenByRater.size, moods: counts });
  }

  if (req.method === 'GET' && path === '/api/next') {
    const rater = raterOf(url.searchParams.get('rater') ?? undefined);
    const moodParam = url.searchParams.get('mood') ?? undefined;
    if (moodParam && !(MOOD_STYLES as readonly string[]).includes(moodParam))
      return sendJson(res, 400, { ok: false, issues: [`unknown mood '${moodParam}'`] });
    const round = nextRound(pool, judgmentsByMood, {
      k,
      mood: moodParam as MoodStyle | undefined,
      exclude: seenByRater.get(rater),
    });
    return round ? sendJson(res, 200, round) : sendJson(res, 200, { done: true });
  }

  if (req.method === 'GET' && path === '/api/rankings') {
    const moodParam = url.searchParams.get('mood') ?? '';
    if (!(MOOD_STYLES as readonly string[]).includes(moodParam))
      return sendJson(res, 400, { ok: false, issues: [`pass ?mood= one of ${MOOD_STYLES.join(',')}`] });
    const judged = judgmentsByMood.get(moodParam as MoodStyle)!;
    const pairs = judgmentsToPairs(judged);
    const withText = (r: { item: string; score: number }): { id: string; text: string; score: number } => ({
      id: r.item,
      text: textById.get(r.item) ?? r.item,
      score: r.score,
    });
    return sendJson(res, 200, {
      mood: moodParam,
      judgments: judged.length,
      bws: bwsCountScores(judged).slice(0, 15).map(withText),
      bradley_terry: fitBradleyTerry(pairs).slice(0, 15).map(withText),
      intransitive_triples: findIntransitiveTriples(pairs).length,
    });
  }

  if (req.method === 'POST' && path === '/api/judgment') {
    let payload: unknown;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      return sendJson(res, 400, { ok: false, issues: [`bad body: ${(e as Error).message}`] });
    }
    const result = validateJudgment(payload);
    if (!result.ok || !result.record) return sendJson(res, 400, { ok: false, issues: result.issues });
    const rec = result.record;
    const rater = raterOf(rec.rater);
    appendLine(anchor, rec); // strict anchor record, one per line — validate-bws-anchor.ts-ready
    const sidecar = (payload as { meta?: unknown }).meta;
    if (sidecar !== undefined) appendLine(meta, { ts: rec.ts, rater, mood: rec.mood, line_ids: rec.line_ids, meta: sidecar });
    judgmentsByMood.get(rec.mood)!.push(judgmentRecordToBws(rec));
    remember(rater, tupleKey(rec.line_ids));
    const flagged = isHoneypotBest(rec, honeypotIds);
    if (flagged) console.error(`  ⚠ QC: rater ${rater} crowned a honeypot line as BEST (${rec.best})`);
    return sendJson(res, 200, { ok: true, flagged });
  }

  sendJson(res, 404, { ok: false, issues: [`no route for ${req.method} ${path}`] });
}

/** The page served at `/`: the --app HTML if given, else the built-in functional preview below. */
function appHtml(): string {
  if (appFile) {
    try {
      return readFileSync(appFile, 'utf-8');
    } catch (e) {
      return `<!doctype html><meta charset=utf-8><body style="font-family:system-ui;padding:2rem"><h1>cannot read --app ${appFile}</h1><pre>${(e as Error).message}</pre>`;
    }
  }
  return PREVIEW_HTML;
}

// A deliberately-plain but fully-functional labeler — proves the loop (next → pick best → pick worst →
// submit → repeat) in a browser before the Claude Design HTML lands. No external resources; uses '+' not
// backticks inside so it nests cleanly in this template literal.
const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>comedic-moods labeler (dev preview)</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;background:#0b0d10;color:#e8eaed}
 h1{font-size:.95rem;opacity:.6;font-weight:600}
 .mood{font-size:1.6rem;font-weight:800;margin:.2rem 0}.voice{opacity:.6;margin-bottom:1rem;font-size:.9rem}
 .prompt{opacity:.85;margin:.6rem 0}
 button.card{display:block;width:100%;text-align:left;margin:.5rem 0;padding:1rem;border-radius:12px;border:2px solid #2a2f36;background:#151a20;color:#e8eaed;font-size:1rem;cursor:pointer;transition:all .12s}
 button.card:hover{border-color:#3a4048}.card.best{border-color:#39d98a;background:#12251c}.card.worst{border-color:#ff6b6b;background:#251314;opacity:.6}
 .bar{display:flex;justify-content:space-between;opacity:.55;font-size:.85rem;margin-top:1rem}.done{text-align:center;padding:3rem 0;font-size:1.2rem}.hint{opacity:.45;font-size:.8rem;margin-top:.5rem}
</style></head><body>
<h1>comedic-moods · dev preview — the polished version comes from Claude Design</h1>
<div id="app">loading…</div><div class="bar"><span id="count">0 judged</span><span id="rater"></span></div>
<script>
var rater=localStorage.getItem('cm_rater');if(!rater){rater='anon-'+Math.random().toString(36).slice(2,8);localStorage.setItem('cm_rater',rater);}
document.getElementById('rater').textContent=rater;var count=0,round=null,best=null,worst=null,t0=0;
function el(id){return document.getElementById(id);}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function load(){best=null;worst=null;fetch('/api/next?rater='+encodeURIComponent(rater)).then(function(r){return r.json();}).then(function(d){if(d.done){el('app').innerHTML='<div class=done>🎉 You are all caught up. Thank you!</div>';return;}round=d;t0=Date.now();render();});}
function render(){var h='<div class=mood>'+round.moodLabel+'</div><div class=voice>'+esc(round.moodVoice)+'</div>';h+='<div class=prompt>Tap the line that <b>BEST</b> embodies <b>'+round.moodLabel+'</b>, then the <b>WORST</b> fit.</div>';for(var i=0;i<round.lines.length;i++){h+='<button class=card data-id="'+round.lines[i].id+'" onclick="pick(this)">'+esc(round.lines[i].text)+'</button>';}h+='<div class=hint>1st tap = best · 2nd tap = worst</div>';el('app').innerHTML=h;}
function pick(btn){var id=btn.getAttribute('data-id');if(best===null){best=id;btn.className='card best';}else if(id!==best&&worst===null){worst=id;btn.className='card worst';submit();}}
function submit(){var rec={schema:'comedic-moods-bws/v0',ts:Date.now(),mood:round.mood,line_ids:round.lines.map(function(l){return l.id;}),best:best,worst:worst,rater:rater};var payload={judgment:rec,meta:{condition:'text',ms_to_decide:Date.now()-t0}};fetch('/api/judgment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(d){if(d.ok){count++;el('count').textContent=count+' judged';setTimeout(load,180);}else{alert('rejected: '+(d.issues||[]).join('; '));load();}});}
load();
</script></body></html>`;

const server = createServer((req, res) => {
  handle(req, res).catch((e) => sendJson(res, 500, { ok: false, issues: [(e as Error).message] }));
});
server.listen(port, () => {
  const addr = server.address();
  const actual = typeof addr === 'object' && addr ? addr.port : port; // resolves the OS-assigned port when --port 0
  const total = [...pool.values()].reduce((n, a) => n + a.length, 0);
  console.log(`[serve] listening on http://localhost:${actual}  ·  ${total} lines · anchor ${anchor}`);
  console.log('[serve] open it in a browser; judgments append to the crowd anchor. Ctrl+C to stop.');
});
