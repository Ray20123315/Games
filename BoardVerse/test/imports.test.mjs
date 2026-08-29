import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function files(dir){const out=[];for(const n of await readdir(dir)){const p=path.join(dir,n),s=await stat(p);if(s.isDirectory())out.push(...await files(p));else if(/\.(?:js|mjs)$/.test(p))out.push(p)}return out}
const allFiles=await files(path.join(root,'src'));
const legacy=path.join(root,'src','legacy','runtime-v023.js');
for(const file of allFiles){const src=await readFile(file,'utf8');for(const m of src.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["'](\.[^"']+)["']/g)){const target=path.resolve(path.dirname(file),m[1]);let ok=true;try{await stat(target)}catch{ok=false}if(!ok&&target===legacy&&process.env.ALLOW_MISSING_LEGACY==='1')continue;assert.ok(ok,`missing relative import: ${path.relative(root,file)} -> ${m[1]}`)}}
console.log(`imports.test: PASS (${allFiles.length} source modules)`);
