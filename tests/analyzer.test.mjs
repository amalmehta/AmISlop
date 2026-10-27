import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, PARAMS } from "../js/analyzer.js";
import { SAMPLES } from "../js/samples.js";

const kinds = (r) => r.flags.map((f) => f.kind);

for (const s of SAMPLES) {
  test(`sample "${s.title}" gets verdict ${s.expect}`, () => {
    const r = analyze(s.text);
    assert.equal(r.verdict.label, s.expect, JSON.stringify({ scores: r.scores, parts: r.parts }));
  });
}

test("crisp sample scores 75+ on every dimension", () => {
  const r = analyze(SAMPLES[0].text);
  for (const v of Object.values(r.scores)) assert.ok(v >= PARAMS.crisp, JSON.stringify(r.scores));
});

test("padded sample: density is the weakest score", () => {
  const r = analyze(SAMPLES[1].text);
  assert.equal(r.verdict.weakest, "density");
  assert.ok(kinds(r).includes("padding"));
});

test("hedgy sample flags hedges and vague words", () => {
  const r = analyze(SAMPLES[2].text);
  assert.ok(r.parts.directness.hedgePer100 > 10);
  assert.ok(kinds(r).includes("vague"));
});

test("taped sample finds topic jumps and unsupported claims", () => {
  const r = analyze(SAMPLES[3].text);
  assert.ok(r.parts.structure.shifts >= 2, JSON.stringify(r.parts.structure));
  assert.ok(kinds(r).includes("claim"));
});

test("tone sample flags the minority register", () => {
  const r = analyze(SAMPLES[4].text);
  assert.ok(r.parts.consistency.mixed >= 2);
  assert.ok(r.flags.some((f) => f.dim === "consistency"));
});

test("empty and whitespace input do not throw and say too short", () => {
  for (const t of ["", "   \n\n  ", null, undefined]) {
    const r = analyze(t);
    assert.equal(r.words, 0);
    assert.equal(r.verdict.label, "Too short");
  }
});

test("very short input gets no verdict", () => {
  assert.equal(analyze("Ship it Friday.").verdict.label, "Too short");
});

test("emoji-only input does not throw", () => {
  const r = analyze("🎉🎉🎉 👍");
  assert.equal(r.verdict.label, "Too short");
});

test("longest match wins: 'just wanted to' is one padding flag, not padding + hedge", () => {
  const r = analyze("Hi Ana, I just wanted to say the build passed on all 3 platforms today.");
  const word = r.flags.filter((f) => f.dim === "density" || f.dim === "directness");
  assert.equal(word.length, 1);
  assert.equal(word[0].kind, "padding");
});

test("curly apostrophes match", () => {
  const r = analyze("Please don’t hesitate to ask about the 4 failing tests in the auth module today.");
  assert.ok(r.flags.some((f) => f.kind === "padding" && /hesitate/.test(f.match)));
});

test("words inside other words are not flagged", () => {
  const r = analyze("The justification for the reallyLongName variable is documented in the thingamajig spec.");
  assert.equal(r.flags.filter((f) => f.dim === "directness" || f.dim === "density").length, 0);
});

test("code blocks and inline code are ignored", () => {
  const r = analyze("Rename `maybe_retry()` to `retry()` in client.py before the 2pm deploy.\n\n```\nif maybe: just_do_it()\n```");
  assert.equal(r.flags.filter((f) => f.kind === "hedge").length, 0);
});

test("a topic marker that opens a new paragraph is fine", () => {
  const r = analyze("The release is on track for Friday at 3pm.\n\nAlso, the offsite is booked for 12 people in room 4B.");
  assert.equal(r.parts.structure.shifts, 0);
});

test("a claim with a reason is not flagged", () => {
  const r = analyze("We should drop the old API because it failed 12 of 40 health checks this week.");
  assert.equal(r.flags.filter((f) => f.kind === "claim").length, 0);
});

test("a question with 'should' is not a claim", () => {
  const r = analyze("Should we drop the old API before the November release or after it?");
  assert.equal(r.flags.filter((f) => f.kind === "claim").length, 0);
});

test("5,000-word wall of text: flagged, scored, fast", () => {
  const para = "The pipeline reads the file and writes the rows to the table for the report. ".repeat(350);
  const t0 = performance.now();
  const r = analyze(para);
  const ms = performance.now() - t0;
  assert.ok(r.words > 5000);
  assert.ok(r.flags.some((f) => f.kind === "wall"));
  assert.ok(ms < 200, `took ${ms.toFixed(1)} ms`);
});

test("flags point at the right text", () => {
  const t = "I think the plan is fine for the 9 people on the team this quarter.";
  const r = analyze(t);
  for (const f of r.flags) if (!f.block) assert.equal(t.slice(f.start, f.end), f.match);
});

test("scores stay within 0–100 on adversarial input", () => {
  const r = analyze("maybe ".repeat(200) + "lol dear sincerely 😅 ".repeat(30));
  for (const v of Object.values(r.scores)) assert.ok(v >= 0 && v <= 100);
});
