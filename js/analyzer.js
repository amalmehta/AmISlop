// The rules engine. Pure: text in, report out. No DOM, no I/O, so it runs in Node tests too.
//
// Four scores, each 0–100, higher = crisper. The formulas and every constant below are
// invented parameters, tuned by hand on the bundled samples, not validated on real data.
// They're shown in the app's "How scores work" panel so nobody mistakes them for science.

import { PADDING, HEDGES, VAGUE, TOPIC_SHIFTS, CLAIMS, REASONS, FORMAL, CASUAL } from "./lexicon.js";

export const DIMENSIONS = [
  { key: "density", label: "Density", short: "Padding", family: "word" },
  { key: "directness", label: "Directness", short: "Hedging", family: "word" },
  { key: "structure", label: "Structure", short: "Taped", family: "message" },
  { key: "consistency", label: "Consistency", short: "Tone", family: "message" },
];

// Tunable constants, in one place so the docs and the help panel can quote them.
export const PARAMS = {
  minWords: 8,            // below this, no verdict
  padPer100: 5,           // Density: points lost per padding word per 100 words
  sentLenFree: 22,        // Density: average sentence length allowed before penalty
  sentLenPer: 2,          // Density: points lost per word over that
  hedgePer100: 6,         // Directness: points lost per hedge per 100 words
  vaguePer100: 3,         // Directness: points lost per vague word per 100 words
  concretePer100: 2,      // Directness: points gained per concrete detail per 100 words
  concreteCap: 10,        //   ...up to this many
  shiftPenalty: 15,       // Structure: points lost per mid-paragraph topic jump
  longParaWords: 100,     // Structure: a paragraph this long is a wall
  longParaPenalty: 15,
  unsupportedWeight: 60,  // Structure: points lost × share of sentences that are unsupported claims
  mixPenalty: 20,         // Consistency: points lost per off-register word (the minority register)
  crisp: 75,              // verdict: every score at or above this → Crisp
  slop: 50,               // verdict: any score below this → named after the weakest
};

const apos = (s) => s.replace(/'/g, "['’]");
const rx = (phrase) => new RegExp(`(?<![\\p{L}\\p{N}'’])(?:${apos(phrase)})(?![\\p{L}\\p{N}])`, "giu");

const compile = (list, kind) =>
  list.map((e) => (Array.isArray(e) ? { re: rx(e[0]), fix: e[1], kind } : { re: rx(e), fix: null, kind }));

const WORD_RULES = [
  ...compile(PADDING, "padding"),
  ...compile(HEDGES, "hedge"),
  ...compile(VAGUE, "vague"),
];
const SHIFT_RULES = compile(TOPIC_SHIFTS, "shift");
const CLAIM_RE = CLAIMS.map(rx);
const REASON_RE = REASONS.map(rx);
const FORMAL_RULES = compile(FORMAL, "formal");
const CASUAL_RULES = compile(CASUAL, "casual");
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CONCRETE_RE =
  /\d|(?<![\p{L}])(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?<![\p{L}])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d|https?:\/\/|@\w+|#\d+/giu;

const DIM_OF = { padding: "density", hedge: "directness", vague: "directness", shift: "structure", wall: "structure", claim: "structure", formal: "consistency", casual: "consistency", emoji: "consistency" };

const NOTE = {
  padding: (m, fix) => `Padding: "${m}" adds words, not meaning. Try: ${fix}.`,
  hedge: (m, fix) => `Hedge: "${m}" softens the point. Try: ${fix}.`,
  vague: (m, fix) => `Vague: "${m}" leaves the reader guessing. Try: ${fix}.`,
  shift: (m) => `New topic mid-paragraph ("${m}"). Give it its own paragraph or message.`,
  wall: (n) => `Wall of text: ${n} words in one paragraph. Split it by point.`,
  claim: (m) => {
    const w = m.trim().split(/\s+/);
    return `Claim without a reason: "${w.slice(0, 6).join(" ")}${w.length > 6 ? "…" : ""}". Add a "because" or the evidence.`;
  },
  formal: (m) => `Formal word ("${m}") in a casual message. Pick one register.`,
  casual: (m) => `Casual word ("${m}") in a formal message. Pick one register.`,
  emoji: (m) => `Emoji (${m}) in a formal message. Pick one register.`,
};

const clamp = (x) => Math.max(0, Math.min(100, Math.round(x)));

function findAll(rules, text) {
  const out = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    for (const m of text.matchAll(r.re)) {
      out.push({ start: m.index, end: m.index + m[0].length, match: m[0], kind: r.kind, fix: r.fix });
    }
  }
  return out;
}

// Keep the longest match where matches overlap, so "just wanted to" isn't also counted as "just".
// Linear in the total span length: mark taken characters instead of comparing every pair.
function dedupe(spans) {
  if (!spans.length) return spans;
  spans.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken = new Uint8Array(Math.max(...spans.map((s) => s.end)) + 1);
  const kept = [];
  outer: for (const s of spans) {
    for (let i = s.start; i < s.end; i++) if (taken[i]) continue outer;
    taken.fill(1, s.start, s.end);
    kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// Mask fenced and inline code so identifiers like `maybe_retry()` aren't flagged.
function maskCode(text) {
  return text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, " "));
}

function segment(text) {
  const paragraphs = [];
  const paraRe = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (const p of text.matchAll(paraRe)) {
    if (!p[0].trim()) continue;
    const start = p.index;
    const sentences = [];
    const sentRe = /[^.!?\n]+(?:[.!?]+["'”’)]*|\n|$)/g;
    for (const s of p[0].matchAll(sentRe)) {
      const raw = s[0];
      if (!/[\p{L}\p{N}]/u.test(raw)) continue;
      const lead = raw.length - raw.trimStart().length;
      sentences.push({ start: start + s.index + lead, end: start + s.index + raw.trimEnd().length });
    }
    paragraphs.push({ start, end: start + p[0].length, sentences });
  }
  return paragraphs;
}

const countWords = (s) => (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

export function analyze(input) {
  const text = String(input ?? "");
  const scan = maskCode(text);
  const words = countWords(scan);
  const paragraphs = segment(scan);
  const sentences = paragraphs.flatMap((p) => p.sentences);
  const flags = [];

  // Word level: padding, hedges, vague words.
  const wordSpans = dedupe(findAll(WORD_RULES, scan));
  for (const s of wordSpans) flags.push({ ...s, note: NOTE[s.kind](s.match, s.fix) });
  const padWords = wordSpans.filter((s) => s.kind === "padding").reduce((n, s) => n + countWords(s.match), 0);
  const hedges = wordSpans.filter((s) => s.kind === "hedge").length;
  const vague = wordSpans.filter((s) => s.kind === "vague").length;
  const concrete = (scan.match(CONCRETE_RE) || []).length;

  // Message level: topic jumps inside a paragraph (not the first sentence).
  const shifts = [];
  for (const p of paragraphs) {
    for (const s of p.sentences.slice(1)) {
      const head = scan.slice(s.start, Math.min(s.end, s.start + 24));
      for (const r of SHIFT_RULES) {
        r.re.lastIndex = 0;
        const m = r.re.exec(head);
        if (m && m.index === 0) { shifts.push({ start: s.start, end: s.start + m[0].length, match: m[0], kind: "shift" }); break; }
      }
    }
    // Same marker after a comma or dash mid-sentence ("…, also the logo").
    for (const s of p.sentences) {
      const seg = scan.slice(s.start, s.end);
      const m = /[,;–—-]\s+(also|oh and|btw|by the way|another thing)(?![\p{L}])/iu.exec(seg);
      if (m) {
        const at = s.start + m.index + m[0].indexOf(m[1]);
        if (!shifts.some((x) => x.start === at)) shifts.push({ start: at, end: at + m[1].length, match: m[1], kind: "shift" });
      }
    }
  }
  for (const s of shifts) flags.push({ ...s, note: NOTE.shift(s.match) });

  const walls = paragraphs.filter((p) => countWords(scan.slice(p.start, p.end)) > PARAMS.longParaWords);
  for (const p of walls) {
    const n = countWords(scan.slice(p.start, p.end));
    flags.push({ start: p.start, end: Math.min(p.end, p.start + 1), match: "", kind: "wall", note: NOTE.wall(n), block: true });
  }

  // Claims without reasons: an absolute word, no reason word in this or the next sentence.
  let unsupported = 0;
  sentences.forEach((s, i) => {
    const seg = scan.slice(s.start, s.end);
    if (/\?\s*$/.test(seg)) return;
    const hasClaim = CLAIM_RE.some((r) => { r.lastIndex = 0; return r.test(seg); });
    if (!hasClaim) return;
    const next = sentences[i + 1] ? scan.slice(sentences[i + 1].start, sentences[i + 1].end) : "";
    const both = seg + " " + next;
    const hasReason = /\d/.test(both) || REASON_RE.some((r) => { r.lastIndex = 0; return r.test(both); });
    if (hasReason) return;
    unsupported++;
    flags.push({ start: s.start, end: s.end, match: seg, kind: "claim", note: NOTE.claim(seg), block: true });
  });

  // Consistency: formal and casual register in the same message. The register the message
  // opens with is the base; words from the other register are flagged as off-tone.
  const formal = dedupe(findAll(FORMAL_RULES, scan));
  const casual = dedupe([...findAll(CASUAL_RULES, scan), ...[...scan.matchAll(EMOJI_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, match: m[0], kind: "emoji" }))]);
  const mixed = Math.min(formal.length, casual.length);
  if (mixed > 0) {
    const off = formal[0].start < casual[0].start ? casual : formal;
    for (const s of off) flags.push({ ...s, note: NOTE[s.kind](s.match) });
  }

  // Scores.
  const per100 = (n) => (words ? (n * 100) / words : 0);
  const avgSent = sentences.length ? words / sentences.length : 0;
  const parts = {
    density: {
      padPer100: per100(padWords),
      avgSentence: avgSent,
    },
    directness: { hedgePer100: per100(hedges), vaguePer100: per100(vague), concretePer100: per100(concrete) },
    structure: { shifts: shifts.length, walls: walls.length, unsupportedShare: sentences.length ? unsupported / sentences.length : 0 },
    consistency: { formal: formal.length, casual: casual.length, mixed },
  };
  const scores = {
    density: clamp(100 - PARAMS.padPer100 * parts.density.padPer100 - PARAMS.sentLenPer * Math.max(0, avgSent - PARAMS.sentLenFree)),
    directness: clamp(
      100 - PARAMS.hedgePer100 * parts.directness.hedgePer100 - PARAMS.vaguePer100 * parts.directness.vaguePer100 +
        Math.min(PARAMS.concreteCap, PARAMS.concretePer100 * parts.directness.concretePer100),
    ),
    structure: clamp(100 - PARAMS.shiftPenalty * shifts.length - PARAMS.longParaPenalty * walls.length - PARAMS.unsupportedWeight * parts.structure.unsupportedShare),
    consistency: clamp(100 - PARAMS.mixPenalty * mixed),
  };

  for (const f of flags) f.dim = DIM_OF[f.kind];
  flags.sort((a, b) => a.start - b.start || (a.block ? 1 : -1));

  return { text, words, sentences: sentences.length, paragraphs: paragraphs.length, flags, scores, parts, verdict: verdict(scores, words) };
}

export function verdict(scores, words) {
  if (words < PARAMS.minWords) return { label: "Too short", tone: "none", line: `Write at least ${PARAMS.minWords} words to get a verdict.` };
  const entries = DIMENSIONS.map((d) => [d, scores[d.key]]);
  const [weakest, low] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const names = { density: "Padded", directness: "Hedgy", structure: "Taped together", consistency: "Taped together" };
  if (low >= PARAMS.crisp) return { label: "Crisp", tone: "good", line: "Every score is 75 or higher. Send it." };
  if (low < PARAMS.slop) return { label: names[weakest.key], tone: "bad", line: `${weakest.label} is ${low}, below 50. Fix that first.`, weakest: weakest.key };
  return { label: "Mostly crisp", tone: "mid", line: `${weakest.label} (${low}) is the weakest. Worth one pass.`, weakest: weakest.key };
}
