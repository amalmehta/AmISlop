# Instructions

## Use it

1. Open **https://amalmehta.github.io/AmISlop/**, or run it locally (below).
2. Paste a message, type one, or bring in a file: the **Upload** button, drag a `.txt`, `.md` or `.eml` anywhere onto the window, or paste the file with ⌘V.
3. Read the verdict and the four scores. Click a note to jump to the words it means.
4. Optional: **Ask Claude** (⌘⇧↵) for a reading of meaning. Its scores appear as dark ticks on each bar.
5. **Save check** (⌘↵) adds it to **History**, where each score gets a trend line (a rolling average of the last 5 checks).

New to it? Click a sample under the editor (Crisp, Padded, Hedgy, Taped together, Patchwork tone) to see what each kind of problem looks like.

### Settings (⌘,)

- **Theme:** System, Light or Dark.
- **Anthropic API key:** needed for Ask Claude. It's stored only in this browser (`localStorage`) and sent only to `api.anthropic.com`. Don't save it on a shared computer. You can create a key at console.anthropic.com.
- **Model:** Claude Opus 5.5 (default, best judgement), Sonnet 5.5 or Haiku 5.5 (cheaper). Requests run at low effort, and Opus and Sonnet have Anthropic's server-side refusal fallback turned on.
- **Demo mode:** try the Ask Claude layout with no key. It returns a canned reply that copies the rule scores and is labelled "Demo — not a real reading".
- **Your data:** export or import history as JSON, or delete it all.

### What it costs

The rules are free. Ask Claude is billed to your Anthropic account. *Estimate:* a 300-word message is about 1,000 input and 800 output tokens, which comes to about 2¢ on Opus 5.5 at $4/$20 per million tokens and less on Sonnet or Haiku. Your Anthropic usage page has the real numbers.

## Run it locally

No build step. Any static file server works:

```bash
python3 -m http.server 8771
```

Then open http://localhost:8771. Opening `index.html` straight from disk also works, but analysis then runs on the main thread, because browsers block module workers on `file://`.

## Test it

```bash
npm test
```

This runs 32 tests in Node (no dependencies): the five samples get their expected verdicts, plus the edge cases (empty input, under 8 words, emoji-only, curly apostrophes, words inside other words, code blocks, a topic marker at a paragraph start, claims with reasons, questions, a 5,000-word wall, flag positions, and out-of-range scores). The Claude tests cover request shape, reply parsing, unanchored quotes, clamped scores, refusals, truncation, malformed JSON and demo mode.

### What the sample run covered, and what only real data can show

The sample run covered every feature end to end in the browser: live highlights, all five samples, demo Ask Claude, saving, history trends, delete, export and import (including bad and partly broken files), upload, drop-anywhere, file paste, `.eml` header stripping, rejecting non-text files, Settings via ⌘,, dark mode, phone width, and a real call to the Anthropic API with an invalid key (the SDK loaded, CORS passed, and the 401 became a plain message).

Only your real data can show:

- **Whether the thresholds fit your writing.** They were tuned on five invented samples. Try 20–30 of your own messages that you already know are good or bad, and check whether the verdicts agree with you.
- **Whether a real Claude reply parses.** That needs a real key. One Ask Claude with your key will confirm it.
- **Whether the trend moves when your writing does.** That takes weeks of saved checks.

## Deploy

The site is plain files, served by GitHub Pages from the `main` branch root. Push to `main` and Pages redeploys within a minute.

## Manual review checklist

Tests can't check these. Run through them after any visual change.

**Feel and readability**
- [ ] On first open, the empty state reads at a glance: one sentence, the samples, and an example note.
- [ ] The verdict word is the first thing your eye lands on, and the scores read top to bottom.
- [ ] Notes use plain words and each one says what to change.
- [ ] Highlight colours tell the dimensions apart: warm for word-level problems (Density, Directness), cool for message-level ones (Structure, Consistency).
- [ ] Dark mode: highlights, bars, dialogs, the help equations, and the trend charts are all readable. Nothing glows.
- [ ] Phone width: there's no horizontal scroll, buttons wrap cleanly, and the feedback tab doesn't cover text you need.

**Smoothness**
- [ ] Typing in a 300-word message never stutters. Highlights catch up within about 150 ms.
- [ ] Pasting 2,000+ words: the page stays responsive (analysis runs in a worker).
- [ ] Switching tabs, opening dialogs, and showing toasts fade in about 200 ms, with no jumps or layout shift.
- [ ] Scores animate to their new values instead of jumping.

**Live services and hardware**
- [ ] Ask Claude with a real key returns scores, reasons and notes, and the notes underline the right words.
- [ ] A wrong key shows "Anthropic rejected the API key", and offline shows "Couldn't reach Anthropic".
- [ ] Drag a file from Finder onto the window, and paste a copied file with ⌘V.
- [ ] Export, then delete all history, then import: everything comes back.
- [ ] Feedback opens a new GitHub issue.
