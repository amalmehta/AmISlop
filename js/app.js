import { analyze, DIMENSIONS } from "./analyzer.js";
import { SAMPLES } from "./samples.js";
import { askClaude, MODELS } from "./claude.js";
import * as store from "./store.js";

const $ = (s) => document.querySelector(s);
const input = $("#input");
const backdrop = $("#backdrop");
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]));
const ICON = {
  bubble: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 12h44v30H28l-12 10V42h-6z"/><path d="M20 22h24M20 30h16"/></svg>`,
  chart: `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M8 70h104M8 70V8"/><path d="M14 58l18-10 16 6 18-20 16 8 22-22" /><circle cx="104" cy="20" r="3"/></svg>`,
  trash: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>`,
};

// ---------- Settings (per-browser) ----------
const SETTINGS_KEY = "amislop.settings";
const settings = Object.assign({ theme: "system", apiKey: "", model: MODELS[0].id, demo: false }, readJSON(SETTINGS_KEY));
function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null") || {}; } catch { return {}; } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }
function applyTheme() {
  if (settings.theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
}

// ---------- State ----------
let report = analyze("");
let claude = null; // { forText, result?, error?, loading? }
let historyCache = null;

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}

// ---------- Editor ----------
// Grow cheaply while typing; only shrink (a full re-layout) after deletions or a new text.
function autosize(shrink = true) {
  if (shrink) input.style.height = "auto";
  if (shrink || input.scrollHeight > input.clientHeight) input.style.height = input.scrollHeight + "px";
}

function claudeFresh() { return claude && claude.forText === input.value ? claude : null; }

function renderBackdrop() {
  const text = report.text;
  const spans = [];
  // Painting thousands of highlights costs ~1 s; real messages have far fewer, so cap it.
  report.flags.forEach((f, i) => {
    if (f.kind === "wall" || i >= 600) return;
    spans.push({ start: f.start, end: f.end, cls: f.kind === "claim" ? "u-structure" : f.dim, i: `r${i}` });
  });
  const c = claudeFresh()?.result;
  c?.notes.forEach((n, i) => { if (n.start != null) spans.push({ start: n.start, end: n.end, cls: "by-claude", i: `c${i}` }); });
  // Sweep line: walk the cut points once, adding and removing spans as they open and close.
  const opens = new Map(), closes = new Map();
  const cuts = new Set([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start); cuts.add(s.end);
    (opens.get(s.start) ?? opens.set(s.start, []).get(s.start)).push(s);
    (closes.get(s.end) ?? closes.set(s.end, []).get(s.end)).push(s);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const on = new Set();
  const parts = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    closes.get(a)?.forEach((s) => on.delete(s));
    opens.get(a)?.forEach((s) => on.add(s));
    const seg = esc(text.slice(a, b));
    if (!on.size) { parts.push(seg); continue; }
    const act = [...on];
    parts.push(`<mark class="${[...new Set(act.map((s) => s.cls))].join(" ")}" data-f="${act.map((s) => s.i).join(" ")}">${seg}</mark>`);
  }
  backdrop.innerHTML = parts.join("") + "\n ";
}

function renderVerdict() {
  const el = $("#verdict");
  if (!report.text.trim()) {
    el.className = "verdict empty";
    el.innerHTML = `${ICON.bubble}<div><div class="line"><strong>Paste a message to see how it reads.</strong></div><div class="line quiet small">Highlights appear as you type. Nothing leaves this page unless you press Ask Claude.</div></div>`;
    return;
  }
  const v = report.verdict;
  el.className = "verdict";
  el.innerHTML = `<div class="label"><span class="badge ${v.tone}"></span>${esc(v.label)}</div><div class="line">${esc(v.line)}</div>`;
}

const WHAT = {
  density: "Padding: words that add length, not meaning",
  directness: "Hedges and vague words where a fact belongs",
  structure: "Topic jumps, walls of text, claims with no reason",
  consistency: "Formal and casual voice mixed together",
};

function renderScores() {
  const c = claudeFresh()?.result;
  const empty = !report.text.trim();
  $("#scores").innerHTML = DIMENSIONS.map((d) => {
    const v = report.scores[d.key];
    const cv = c?.scores[d.key];
    return `<div class="score" title="${esc(WHAT[d.key])}">
      <span class="name"><i class="dot ${d.key}"></i>${d.label}</span>
      <span class="val">${empty ? "–" : v}${cv != null ? `<span class="c">Claude ${cv}</span>` : ""}</span>
      <span class="bar"><i class="${d.key}" style="width:${empty ? 0 : v}%"></i>${cv != null ? `<b style="left:calc(${cv}% - 1px)"></b>` : ""}</span>
      ${empty ? `<span class="why">${WHAT[d.key]}</span>` : c?.reasons[d.key] ? `<span class="why">${esc(c.reasons[d.key])}</span>` : ""}
    </div>`;
  }).join("");
}

function renderClaude() {
  const el = $("#claude");
  const c = claudeFresh();
  if (!c) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "claude" + (c.loading ? " loading" : "");
  if (c.loading) { el.innerHTML = `<div class="head">Claude is reading</div><div class="summary">Usually 3–10 seconds</div>`; return; }
  if (c.error) {
    el.innerHTML = `<div class="head">Ask Claude</div><div class="err">${esc(c.error)}</div><div class="row"><button class="ghost small" data-act="settings">Open Settings</button><button class="ghost small" data-act="retry">Try again</button></div>`;
    return;
  }
  const r = c.result;
  el.innerHTML = `<div class="head">Claude's reading ${r.demo ? `<span class="tag">Demo — not a real reading</span>` : `<small>${esc(r.model)}</small>`}</div>
    <div class="summary">${esc(r.summary)}</div>
    <div class="quiet small">Claude's scores are the dark ticks on each bar. They're a second opinion, not blended into the rule scores.</div>`;
}

function renderNotes() {
  const list = $("#notes");
  const c = claudeFresh()?.result;
  const items = [
    ...report.flags.map((f, i) => ({ id: `r${i}`, dim: f.dim, note: f.note, start: f.start, end: f.end, src: "" })),
    ...(c?.notes ?? []).map((n, i) => ({ id: `c${i}`, dim: n.dim, note: (n.start == null && n.quote ? `"${n.quote}": ` : "") + n.note, start: n.start, end: n.end, src: "Claude" })),
  ];
  const head = $("#notes-h");
  head.innerHTML = `Notes <span>${items.length ? items.length + (items.length === 1 ? " note" : " notes") : ""}</span>`;
  if (!report.text.trim()) {
    list.innerHTML = `<li class="empty">Each problem gets a note with a fix. Click a note to jump to the words. For example:</li>
      <li class="empty example"><i class="dot density"></i> Padding: "I just wanted to circle back" adds words, not meaning. Try: say the thing directly.</li>`;
    return;
  }
  if (!items.length) {
    list.innerHTML = `<li class="empty">No flags. The rules found no padding, hedges, topic jumps or tone clashes. They can't judge whether the ideas hold up, so Ask Claude if it matters.</li>`;
    return;
  }
  // Claude's notes first (fewer, about meaning), then the first 150 rule notes; long texts stay fast.
  const shown = [...items.filter((n) => n.src), ...items.filter((n) => !n.src)].slice(0, 150);
  list.innerHTML = shown.map((n) =>
    `<li data-id="${n.id}" data-s="${n.start ?? ""}" data-e="${n.end ?? ""}"><i class="dot ${n.dim}"></i><span>${esc(n.note)}${n.src ? `<span class="src">${n.src}</span>` : ""}</span></li>`
  ).join("") + (items.length > shown.length ? `<li class="empty">…and ${items.length - shown.length} more. Fix the first ones and the rest often go with them.</li>` : "");
}

function renderCheck() {
  renderBackdrop();
  renderVerdict();
  renderScores();
  renderClaude();
  renderNotes();
  const w = report.words;
  $("#count").textContent = `${w} word${w === 1 ? "" : "s"}`;
}

// Analysis runs in a worker; replies for text that has since changed are dropped.
// If workers aren't available (e.g. opened from file://), it falls back to the main thread.
let worker = null;
let reqId = 0;
try {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => { if (e.data.id === reqId) { report = e.data.report; renderCheck(); } };
  worker.onerror = () => { worker = null; refresh(); };
} catch { worker = null; }

function refresh() {
  const text = input.value;
  if (!text.trim()) { reqId++; report = analyze(""); renderCheck(); return; }
  if (worker) worker.postMessage({ id: ++reqId, text });
  else { report = analyze(text); renderCheck(); }
}

let debounce;
let draftTimer;
input.addEventListener("input", (e) => {
  autosize(!e.inputType || e.inputType.startsWith("delete") || e.inputType === "insertFromPaste");
  clearTimeout(debounce);
  debounce = setTimeout(refresh, 120);
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { try { localStorage.setItem("amislop.draft", input.value); } catch {} }, 400);
});

function setText(text) {
  input.value = text;
  autosize();
  refresh();
  try { localStorage.setItem("amislop.draft", text); } catch {}
}

// Notes ↔ highlights
$("#notes").addEventListener("mouseover", (e) => {
  const li = e.target.closest("li[data-id]");
  backdrop.querySelectorAll("mark.active").forEach((m) => m.classList.remove("active"));
  if (li) backdrop.querySelectorAll(`mark[data-f~="${li.dataset.id}"]`).forEach((m) => m.classList.add("active"));
});
$("#notes").addEventListener("mouseleave", () => backdrop.querySelectorAll("mark.active").forEach((m) => m.classList.remove("active")));
$("#notes").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li || li.dataset.s === "") return;
  const s = +li.dataset.s, en = +li.dataset.e;
  input.focus({ preventScroll: true });
  input.setSelectionRange(s, en);
  const m = backdrop.querySelector(`mark[data-f~="${li.dataset.id}"]`);
  m?.scrollIntoView({ block: "center", behavior: "smooth" });
});

// Samples
const samplesEl = $("#samples");
for (const s of SAMPLES) {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = s.title;
  b.addEventListener("click", () => { setText(s.text); input.focus(); });
  samplesEl.append(b);
}

// ---------- Save & Ask ----------
async function saveCheck() {
  if (!input.value.trim()) { toast("Nothing to save yet. Paste a message first."); return; }
  if (report.text !== input.value) report = analyze(input.value);
  const c = claudeFresh()?.result;
  const check = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    text: input.value,
    words: report.words,
    scores: report.scores,
    verdict: report.verdict.label,
    claude: c && !c.demo ? { scores: c.scores, summary: c.summary, model: c.model } : null,
  };
  try {
    await store.saveCheck(check);
    historyCache = null;
    toast(`Saved: ${check.verdict}. See it in History.`);
  } catch (e) {
    toast(`Couldn't save: ${e.message}. Is private browsing blocking storage?`);
  }
}

async function runClaude() {
  const text = input.value;
  if (!text.trim()) { toast("Paste a message first."); return; }
  claude = { forText: text, loading: true };
  renderCheck();
  try {
    const result = await askClaude(text, settings);
    if (claude?.forText === text) claude = { forText: text, result };
  } catch (e) {
    if (claude?.forText === text) claude = { forText: text, error: e.message };
  }
  renderCheck();
}

$("#save-btn").addEventListener("click", saveCheck);
$("#ask-btn").addEventListener("click", runClaude);
$("#claude").addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "settings") openSettings();
  if (act === "retry") runClaude();
});

// ---------- Files: upload, drop anywhere, paste ----------
const TEXT_EXT = /\.(txt|md|markdown|eml|text)$/i;
async function readFile(file) {
  if (!file) return;
  if (!(file.type.startsWith("text/") || file.type === "message/rfc822" || TEXT_EXT.test(file.name))) {
    toast(`"${file.name}" isn't a text file. Use .txt, .md or .eml.`);
    return;
  }
  if (file.size > 1_000_000) { toast("That file is over 1 MB. Paste the part you want checked."); return; }
  let text = await file.text();
  if (/\.eml$/i.test(file.name) || file.type === "message/rfc822") {
    const i = text.search(/\r?\n\r?\n/);
    if (i > 0) text = text.slice(i).trim();
  }
  location.hash = "#check";
  setText(text.replace(/\r\n/g, "\n"));
  toast(`Loaded ${file.name}`);
}
$("#upload-btn").addEventListener("click", () => $("#file").click());
$("#file").addEventListener("change", (e) => { readFile(e.target.files[0]); e.target.value = ""; });

const drop = $("#drop");
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; drop.hidden = false; });
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  readFile(e.dataTransfer.files[0]);
});
document.addEventListener("paste", (e) => {
  const files = e.clipboardData?.files;
  if (files?.length) { e.preventDefault(); readFile(files[0]); return; }
  const active = document.activeElement;
  if (active !== input && !["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName)) {
    const t = e.clipboardData?.getData("text/plain");
    if (t) { e.preventDefault(); location.hash = "#check"; setText(t); input.focus(); }
  }
});

// ---------- History ----------
const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const VERDICT_TONE = { "Crisp": "good", "Mostly crisp": "mid", "Padded": "bad", "Hedgy": "bad", "Taped together": "bad", "Too short": "none" };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function trendSvg(values, key) {
  const W = 240, H = 64, pad = 4;
  const n = values.length;
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const rolling = values.map((_, i) => mean(values.slice(Math.max(0, i - 4), i + 1)));
  const line = rolling.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const dots = values.map((v, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.2" fill="var(--${key})"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${DIM[key].label} over time">
    <line class="grid" x1="0" x2="${W}" y1="${y(75)}" y2="${y(75)}"/><line class="grid" x1="0" x2="${W}" y1="${y(50)}" y2="${y(50)}"/>
    ${dots}<path d="${line}" stroke="var(--${key})" vector-effect="non-scaling-stroke"/></svg>`;
}

async function renderHistory() {
  const list = $("#history-list");
  const trends = $("#trends");
  if (!historyCache) {
    try { historyCache = await store.listChecks(); }
    catch (e) { list.innerHTML = `<li class="empty-state"><p>Couldn't open history: ${esc(e.message)}</p></li>`; return; }
  }
  const rows = historyCache;
  const now = Date.now();
  const recent = rows.filter((r) => now - r.createdAt < 30 * 864e5).length;
  $("#history-sub").textContent = rows.length
    ? `${rows.length} check${rows.length === 1 ? "" : "s"} saved, ${recent} in the last 30 days. Lines show the average of your last 5 checks; dots are single checks.`
    : "";
  if (!rows.length) {
    trends.innerHTML = "";
    list.innerHTML = `<li class="empty-state">${ICON.chart}<p><strong>No checks yet.</strong><br>Save a check (⌘↵) and your scores start building a line here.</p><button class="primary" id="hist-sample">Check a sample message</button></li>`;
    $("#hist-sample").addEventListener("click", () => { location.hash = "#check"; setText(SAMPLES[1].text); });
    return;
  }
  const asc = [...rows].reverse().filter((r) => r.words >= 8);
  trends.innerHTML = DIMENSIONS.map((d) => {
    const vals = asc.map((r) => r.scores[d.key]);
    const last5 = mean(vals.slice(-5)), prev5 = mean(vals.slice(-10, -5));
    const delta = Number.isFinite(prev5) ? Math.round(last5 - prev5) : null;
    const desc = vals.length < 2 ? "Save 2+ checks to see a trend"
      : delta == null ? `Average of last ${Math.min(5, vals.length)}`
      : `${delta > 0 ? "▲ " + delta : delta < 0 ? "▼ " + -delta : "No change"} vs the 5 before`;
    return `<div class="trend"><div class="t"><span class="row"><i class="dot ${d.key}"></i>${d.label}</span><span class="n">${vals.length ? Math.round(last5) : "–"}</span></div>
      <div class="d">${desc}</div>${vals.length ? trendSvg(vals, d.key) : ""}</div>`;
  }).join("");
  list.innerHTML = rows.map((r) => `<li data-id="${r.id}" title="Open in Check">
      <span class="date">${fmtDate(r.createdAt)}</span>
      <span class="v"><span class="badge ${VERDICT_TONE[r.verdict] ?? "none"}" style="width:9px;height:9px;border-radius:50%"></span>${esc(r.verdict)}</span>
      ${DIMENSIONS.map((d) => `<span class="n" title="${d.label}"><i class="dot ${d.key}"></i>${r.scores[d.key]}</span>`).join("")}
      <span class="x">${esc(r.text.slice(0, 160))}</span>
      <button class="icon-btn del" data-del="${r.id}" aria-label="Delete this check" title="Delete">${ICON.trash}</button>
    </li>`).join("");
}

$("#history-list").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    const id = del.dataset.del;
    historyCache = historyCache.filter((r) => r.id !== id);
    renderHistory();
    await store.deleteCheck(id).catch((err) => toast(`Couldn't delete: ${err.message}`));
    toast("Deleted.");
    return;
  }
  const li = e.target.closest("li[data-id]");
  const row = li && historyCache.find((r) => r.id === li.dataset.id);
  if (row) { location.hash = "#check"; setText(row.text); }
});

async function doExport() {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `Am I Slop history ${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${data.checks.length} checks.`);
}
async function doImport(file) {
  if (!file) return;
  try {
    const { added, skipped } = await store.importAll(JSON.parse(await file.text()));
    historyCache = null;
    renderHistory();
    toast(`Imported ${added} check${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} broken` : ""}.`);
  } catch (e) {
    toast(e instanceof SyntaxError ? "That file isn't valid JSON." : e.message);
  }
}
$("#export-btn").addEventListener("click", doExport);
$("#s-export").addEventListener("click", doExport);
$("#import-btn").addEventListener("click", () => $("#import-file").click());
$("#s-import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", (e) => { doImport(e.target.files[0]); e.target.value = ""; });
$("#s-clear").addEventListener("click", async () => {
  if (!confirm("Delete every saved check in this browser? Export first if you want a copy. This can't be undone.")) return;
  await store.clearAll();
  historyCache = null;
  renderHistory();
  toast("History deleted.");
});

// ---------- Settings dialog ----------
const dlg = $("#settings");
const modelSel = $("#model");
modelSel.innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
function openSettings() {
  dlg.querySelector(`input[name="theme"][value="${settings.theme}"]`).checked = true;
  $("#api-key").value = settings.apiKey;
  modelSel.value = settings.model;
  $("#demo").checked = settings.demo;
  if (!dlg.open) dlg.showModal();
}
$("#open-settings").addEventListener("click", openSettings);
dlg.addEventListener("change", (e) => {
  if (e.target.name === "theme") { settings.theme = e.target.value; applyTheme(); }
  if (e.target.id === "model") settings.model = e.target.value;
  if (e.target.id === "demo") settings.demo = e.target.checked;
  saveSettings();
});
$("#api-key").addEventListener("input", (e) => { settings.apiKey = e.target.value.trim(); saveSettings(); });
$("#key-toggle").addEventListener("click", (e) => {
  const k = $("#api-key");
  k.type = k.type === "password" ? "text" : "password";
  e.target.textContent = k.type === "password" ? "Show" : "Hide";
});
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

// ---------- How scores work (KaTeX loaded on first open) ----------
let katexP;
$("#how-btn").addEventListener("click", async () => {
  const how = $("#how");
  how.showModal();
  how.addEventListener("click", (e) => { if (e.target === how) how.close(); }, { once: true });
  if (!katexP) {
    const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: "https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css" });
    document.head.append(css);
    katexP = import("https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.mjs");
  }
  try {
    const { default: katex } = await katexP;
    how.querySelectorAll("[data-tex]").forEach((el) => {
      if (el.dataset.done) return;
      katex.render(el.dataset.tex, el, { displayMode: el.classList.contains("eq"), throwOnError: false });
      el.dataset.done = "1";
    });
  } catch {
    how.querySelectorAll("[data-tex]:not([data-done])").forEach((el) => (el.textContent = el.dataset.tex));
  }
});

// ---------- Routing & keys ----------
function route() {
  const view = location.hash === "#history" ? "history" : "check";
  $("#view-check").hidden = view !== "check";
  $("#view-history").hidden = view !== "history";
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === view)));
  if (view === "history") renderHistory();
  else autosize();
}
window.addEventListener("hashchange", route);

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === ",") { e.preventDefault(); openSettings(); }
  else if (mod && e.key === "Enter" && e.shiftKey) { e.preventDefault(); runClaude(); }
  else if (mod && e.key === "Enter") { e.preventDefault(); saveCheck(); }
});

// ---------- Start ----------
applyTheme();
let draft = "";
try { draft = localStorage.getItem("amislop.draft") || ""; } catch {}
setText(draft);
route();
