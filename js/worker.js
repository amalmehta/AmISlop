// Runs the rules engine off the main thread so typing never waits on it.
import { analyze } from "./analyzer.js";

self.onmessage = (e) => {
  const { id, text } = e.data;
  self.postMessage({ id, report: analyze(text) });
};
