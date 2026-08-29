import fs from 'node:fs';
const p='test/feature-policy.test.mjs';
let s=fs.readFileSync(p,'utf8');
s=s.replace('assert.match(entry,/feature\\.canReady = feature\\.myRole === "player" && feature\\.status === "waiting"/);','assert.match(entry,/feature\\.canReady = !feature\\.adminPaused && feature\\.myRole === "player" && feature\\.status === "waiting"/);');
fs.writeFileSync(p,s);
console.log('v0.1.2 merged pause assertion updated');
