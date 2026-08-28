import { readFile, writeFile } from "node:fs/promises";
const file = new URL("./sim-v024.mjs", import.meta.url);
let s = await readFile(file, "utf8");
const old = "replaceExact('      createdAt: now,\\n      updatedAt: now,\\n      ownerId: owner.id,', '      createdAt: now,\\n      updatedAt: now,\\n      startedAt: null,\\n      endedAt: null,\\n      opening: null,\\n      ownerId: owner.id,', 'room time initialization');";
const next = "replaceExact('      ownerId: owner.id,', '      startedAt: null,\\n      endedAt: null,\\n      opening: null,\\n      ownerId: owner.id,', 'room time initialization');";
if (!s.includes(old)) throw new Error('compat source marker missing');
s = s.replace(old, next);
await writeFile(file, s, "utf8");
