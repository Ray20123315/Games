import fs from 'node:fs';

try {
  await import('./patch-v012-followups2.mjs?apply=1');
} catch (error) {
  if (!String(error?.message || error).includes('browser test anchor missing')) throw error;
}

const path = 'test/browser-scripts.test.mjs';
let source = fs.readFileSync(path, 'utf8');
const anchor = "console.log('browser-scripts.test: PASS');";
if (!source.includes(anchor)) throw new Error('actual browser test anchor missing');
const assertions = [
  "assert.doesNotMatch(BRIDGE_SCRIPT, /B\\[k\\]=NativeWS\\[k\\]/, 'WebSocket wrapper must not overwrite readonly static constants');",
  "assert.match(ENHANCE_SCRIPT, /syncMultiplayerGameOptions=function\\(\\)\\{\\}/, 'multiplayer sync callback must live in enhancement scope');",
  "assert.doesNotMatch(ENHANCE_SCRIPT, /prompt\\(text\\('Preset/, 'Preset naming must not use native prompt');",
  "assert.match(ENHANCE_SCRIPT, /bvPresetNameOverlay/, 'Preset naming must use the custom modal');",
  "assert.match(ENHANCE_SCRIPT, /bv-code-shell/, 'custom room code must use the custom field shell');",
].join('\n') + '\n';
source = source.replace(anchor, assertions + anchor);
fs.writeFileSync(path, source);
console.log('v0.1.2 follow-up patch v3 applied');
