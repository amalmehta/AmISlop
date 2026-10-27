import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseReply, demoReply, SCHEMA } from "../js/claude.js";

const TEXT = "I think we should maybe ship on Friday. Also the logo is wrong.";
const reply = (obj, extra = {}) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(obj) }], ...extra });
const GOOD = {
  summary: "Hedged and jumps topic.",
  scores: { density: 80, directness: 40, structure: 35, consistency: 90 },
  reasons: { density: "Short.", directness: "Hedges.", structure: "Two topics.", consistency: "One voice." },
  notes: [
    { quote: "I think we should maybe", dimension: "directness", note: "Decide." },
    { quote: "Also the logo is wrong", dimension: "structure", note: "Separate message." },
    { quote: "words that are not in the text", dimension: "density", note: "Paraphrased quote." },
  ],
};

test("request uses Opus 5.5 at low effort with JSON schema and server-side fallback", () => {
  const r = buildRequest(TEXT, "claude-opus-5-5");
  assert.equal(r.model, "claude-opus-5-5");
  assert.equal(r.output_config.effort, "low");
  assert.equal(r.output_config.format.type, "json_schema");
  assert.equal(r.fallbacks, "default");
  assert.deepEqual(r.betas, ["server-side-fallback-2026-07-01"]);
  assert.ok(r.messages[0].content.includes(TEXT));
  assert.equal(r.thinking, undefined);
  assert.equal(r.temperature, undefined);
});

test("Haiku has no server-side fallback, unknown model falls back to the default", () => {
  assert.equal(buildRequest(TEXT, "claude-haiku-5-5").fallbacks, undefined);
  assert.equal(buildRequest(TEXT, "nonsense").model, "claude-opus-5-5");
});

test("schema requires every field and forbids extras", () => {
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual(SCHEMA.required.sort(), ["notes", "reasons", "scores", "summary"]);
});

test("parses a good reply and anchors quotes that exist in the text", () => {
  const r = parseReply(reply(GOOD), TEXT);
  assert.equal(r.scores.structure, 35);
  assert.equal(r.notes[0].start, 0);
  assert.equal(TEXT.slice(r.notes[1].start, r.notes[1].end), "Also the logo is wrong");
  assert.equal(r.notes[2].start, null, "a quote not in the text must not highlight anything");
});

test("clamps out-of-range and missing scores", () => {
  const r = parseReply(reply({ ...GOOD, scores: { density: 140, directness: -5, structure: "x" } }), TEXT);
  assert.deepEqual(r.scores, { density: 100, directness: 0, structure: 0, consistency: 0 });
});

test("bad dimension names fall back to structure; notes capped at 8", () => {
  const notes = Array.from({ length: 12 }, () => ({ quote: "Friday", dimension: "vibes", note: "n" }));
  const r = parseReply(reply({ ...GOOD, notes }), TEXT);
  assert.equal(r.notes.length, 8);
  assert.equal(r.notes[0].dim, "structure");
});

test("refusal, truncation and malformed JSON give plain error messages", () => {
  assert.throws(() => parseReply({ stop_reason: "refusal", content: [] }, TEXT), /declined/);
  assert.throws(() => parseReply({ stop_reason: "max_tokens", content: [] }, TEXT), /cut off/);
  assert.throws(() => parseReply({ stop_reason: "end_turn", content: [{ type: "text", text: "{not json" }] }, TEXT), /valid JSON/);
});

test("ignores non-text blocks (e.g. thinking) when parsing", () => {
  const r = parseReply({ ...reply(GOOD), content: [{ type: "thinking", thinking: "" }, ...reply(GOOD).content] }, TEXT);
  assert.equal(r.summary, GOOD.summary);
});

test("demo mode works without a key and is labelled", async () => {
  const r = await demoReply(TEXT);
  assert.equal(r.demo, true);
  assert.match(r.summary, /Demo/);
  assert.equal(r.model, "demo (no API call)");
});
