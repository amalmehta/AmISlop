// Optional second opinion from Claude. Rules see words; Claude reads meaning:
// whether ideas connect, whether claims have reasons, whether the tone holds.
// The request goes from this browser straight to api.anthropic.com with the user's own key.

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — best judgement", fallback: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — cheaper", fallback: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — cheapest", fallback: false },
];

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm";

export const SYSTEM = `You grade one message someone wrote (Slack, email, PR description) for whether it is crisp or slop.
Score four dimensions from 0 to 100, higher is crisper:
- density: every sentence earns its place; no throat-clearing, restating, or filler.
- directness: says what it means; no hedging ("I think maybe"), no vague words where a number, name or date belongs.
- structure: one topic per paragraph; points connect with "because/so/but"; claims come with reasons. Low if it feels taped together rather than sturdy.
- consistency: one register and voice throughout; no patchwork of formal and casual, or of tenses and pronouns.
Rules: judge the writing, not the opinions in it. Be strict but fair; a short clear message can score 100.
Each note must quote an exact substring of the message (copy it character for character) and say in one plain sentence what to change.
Give at most 8 notes, most important first. Reasons are one short sentence each.`;

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "reasons", "notes", "summary"],
  properties: {
    summary: { type: "string", description: "One sentence verdict, plain words." },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["density", "directness", "structure", "consistency"],
      properties: Object.fromEntries(["density", "directness", "structure", "consistency"].map((k) => [k, { type: "integer" }])),
    },
    reasons: {
      type: "object",
      additionalProperties: false,
      required: ["density", "directness", "structure", "consistency"],
      properties: Object.fromEntries(["density", "directness", "structure", "consistency"].map((k) => [k, { type: "string" }])),
    },
    notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "dimension", "note"],
        properties: {
          quote: { type: "string" },
          dimension: { type: "string", enum: ["density", "directness", "structure", "consistency"] },
          note: { type: "string" },
        },
      },
    },
  },
};

export function buildRequest(text, model) {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0];
  const req = {
    model: m.id,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `<message>\n${text}\n</message>` }],
  };
  // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
  if (m.fallback) Object.assign(req, { fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
  return req;
}

const clamp = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));

// Turn the API reply into a report the UI can show. Notes whose quote isn't in the text are kept
// but marked unanchored, so a paraphrased quote never highlights the wrong words.
export function parseReply(response, text) {
  if (response?.stop_reason === "refusal") {
    throw new Error("Claude declined to grade this message. Try rewording it, or use the rule scores alone.");
  }
  if (response?.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off. Try a shorter message.");
  const raw = (response?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Claude's reply wasn't valid JSON. Try again.");
  }
  const dims = ["density", "directness", "structure", "consistency"];
  const scores = Object.fromEntries(dims.map((k) => [k, clamp(data?.scores?.[k])]));
  const reasons = Object.fromEntries(dims.map((k) => [k, String(data?.reasons?.[k] ?? "")]));
  const notes = (Array.isArray(data?.notes) ? data.notes : []).slice(0, 8).map((n) => {
    const quote = String(n?.quote ?? "");
    const start = quote ? text.indexOf(quote) : -1;
    return {
      quote,
      dim: dims.includes(n?.dimension) ? n.dimension : "structure",
      note: String(n?.note ?? ""),
      start: start >= 0 ? start : null,
      end: start >= 0 ? start + quote.length : null,
    };
  });
  return { scores, reasons, notes, summary: String(data?.summary ?? ""), model: response?.model ?? "", usage: response?.usage ?? null };
}

let sdk;
export async function askClaude(text, { apiKey, model, demo }) {
  if (demo) return demoReply(text);
  if (!apiKey) throw new Error("Add your Anthropic API key in Settings (⌘,) to ask Claude. Or turn on demo mode.");
  sdk ??= import(/* @vite-ignore */ SDK_URL);
  const { default: Anthropic } = await sdk;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const req = buildRequest(text, model);
  try {
    const res = req.betas ? await client.beta.messages.create(req) : await client.messages.create(req);
    return parseReply(res, text);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("Anthropic rejected the API key. Check it in Settings.");
    if (e instanceof Anthropic.RateLimitError) throw new Error("Rate limited by Anthropic. Wait a minute and try again.");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Anthropic. Check your connection.");
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic error ${e.status ?? ""}: ${e.message}`);
    throw e;
  }
}

// Demo mode: a canned reply built locally so the flow can be tried without a key.
// It is clearly labelled in the UI as not a real Claude reading.
export async function demoReply(text) {
  await new Promise((r) => setTimeout(r, 600));
  const { analyze } = await import("./analyzer.js");
  const r = analyze(text);
  const notes = r.flags.filter((f) => !f.block && f.match).slice(0, 5).map((f) => ({ quote: f.match, dimension: f.dim, note: f.note }));
  const reply = {
    stop_reason: "end_turn",
    model: "demo (no API call)",
    content: [{
      type: "text",
      text: JSON.stringify({
        summary: `Demo reply: this mirrors the rule scores so you can see the layout. Add a key in Settings for a real reading.`,
        scores: r.scores,
        reasons: {
          density: "Demo: based on padding phrases found by the rules.",
          directness: "Demo: based on hedges and vague words found by the rules.",
          structure: "Demo: a real reading judges whether the ideas connect.",
          consistency: "Demo: a real reading judges voice and tense, not just word lists.",
        },
        notes,
      }),
    }],
  };
  return { ...parseReply(reply, text), demo: true };
}
