// History of checks, in this browser's IndexedDB. Nothing is sent anywhere.
// Swap this file for a sync backend later; keep the same exported functions.

const DB = "amislop";
const STORE = "checks";
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const saveCheck = (check) => tx("readwrite", (s) => s.put(check)).then(() => check);
export const deleteCheck = (id) => tx("readwrite", (s) => s.delete(id));
export const clearAll = () => tx("readwrite", (s) => s.clear());
export const listChecks = () =>
  tx("readonly", (s) => s.getAll()).then((rows) => rows.sort((a, b) => b.createdAt - a.createdAt));

export async function exportAll() {
  const checks = await listChecks();
  return { app: "Am I Slop?", version: 1, exportedAt: new Date().toISOString(), checks };
}

// Accepts an export file. Returns how many checks were added (existing ids are overwritten).
export async function importAll(data) {
  const rows = Array.isArray(data) ? data : data?.checks;
  if (!Array.isArray(rows)) throw new Error("That file isn't an Am I Slop? export (no \"checks\" list).");
  const valid = rows.filter((r) => r && typeof r.id === "string" && typeof r.text === "string" && typeof r.createdAt === "number" && r.scores);
  await tx("readwrite", (s) => valid.forEach((r) => s.put(r)));
  return { added: valid.length, skipped: rows.length - valid.length };
}
