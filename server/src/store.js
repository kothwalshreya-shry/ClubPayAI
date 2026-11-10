import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../data/db.json");
const initial = { budget: 25000, purchases: [], transactions: [] };

export function readStore() {
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2));
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return structuredClone(initial);
  }
}
export function writeStore(data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}
