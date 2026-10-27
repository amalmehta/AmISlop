# File structure

```
index.html            The whole page: header, Check and History views, Settings and "How scores work" dialogs
css/style.css         Colour tokens (light and dark), layout, components
js/app.js             UI: editor highlights, margin notes, history, settings, files, shortcuts
js/analyzer.js        Rules engine. Pure function analyze(text) → scores, flags, verdict. Also the tunable PARAMS
js/lexicon.js         Phrase lists (padding, hedges, vague words, topic shifts, claims, reasons, formal and casual), with sources
js/worker.js          Runs analyze() off the main thread
js/claude.js          Ask Claude: prompt, JSON schema, API call through the Anthropic SDK, reply parsing, demo mode
js/store.js           History in IndexedDB, plus export and import
js/samples.js         Five invented sample messages, used in the UI and the tests
assets/icon.svg       App icon and favicon (message bubble, check mark, terracotta dot)
assets/icon-*.png     PNG versions of the icon (180 px for iOS home screen, 512 px)
tests/                node --test suites for the analyzer and the Claude reply handling
docs/                 Instructions, system design, this file, prompt log, README screenshots
AmISlop?.md           The project spec, with definitions, assumptions and changelog
package.json          Only the `npm test` script. No dependencies
```
