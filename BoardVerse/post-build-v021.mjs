import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "b153db101988e5cd1d1381ff4e4dde2e6caa54036556fb9dc470eded10e7f53a";
const expectedSha256 = "b7252d2ed11e76a0e7645c1a1c681ba3a6fc821b7555663a9bb15d195f98015a";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.20 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.20";', 'const APP_VERSION = "0.0.21";', "version");
replaceExact(
  'var ruleDrafts={};',
  'var ruleDrafts=window.__boardverseRuleDrafts||(window.__boardverseRuleDrafts={});',
  "persistent rule draft store"
);
replaceExact(
  'function renderRuleFields(){',
  'function syncRuleControls(gameId,family,def,box){var draft=ruleDrafts[gameId]||{};def.fields.forEach(function(f){var el=box.querySelector(\'[data-rule-key="\'+f.key+\'"]\');if(!el)return;el.disabled=false;el.removeAttribute(\'disabled\');el.removeAttribute(\'aria-disabled\');el.style.pointerEvents=\'auto\';if(document.activeElement!==el&&Object.prototype.hasOwnProperty.call(draft,f.key)){if(f.type===\'checkbox\')el.checked=!!draft[f.key];else el.value=String(draft[f.key])}var row=el.closest(\'.setting-row\');if(row&&f.when){var depKey=Object.keys(f.when)[0];row.classList.toggle(\'hidden\',String(draft[depKey])!==String(f.when[depKey]))}})}\nfunction renderRuleFields(){',
  "rule control sync helper"
);
replaceExact(
  "function renderRuleFields(){var box=$('ruleFields');if(!box)return;var gameId=$('gameId').value;",
  "function renderRuleFields(){var box=$('ruleFields');if(!box)return;var locked=box.closest('fieldset[disabled]');if(locked&&$('createForm')&&$('createForm').contains(locked))locked.disabled=false;var gameId=$('gameId').value;",
  "rule fieldset unlock"
);
replaceExact(
  "el.setAttribute('data-rule-key',f.key);function saveDraft(){ruleDrafts[gameId][f.key]=ruleControlValue(f,el)}el.addEventListener('input',saveDraft);el.addEventListener('change',function(){saveDraft();if(family==='go'&&f.key==='ruleset'){var p={chinese:{scoring:'area',komi:7.5,koRule:'simple',suicide:false},japanese:{scoring:'territory',komi:6.5,koRule:'simple',suicide:false},aga:{scoring:'area',komi:7.5,koRule:'superko',suicide:false},newzealand:{scoring:'area',komi:7,koRule:'superko',suicide:true}}[String(ruleDrafts[gameId].ruleset)];if(p)Object.assign(ruleDrafts[gameId],p)}if(family==='gomoku'&&f.key==='variant'&&ruleDrafts[gameId].variant==='connect6')ruleDrafts[gameId].opening='none';renderRuleFields()});box.appendChild(row)",
  "el.setAttribute('data-rule-key',f.key);el.disabled=false;el.removeAttribute('disabled');el.removeAttribute('aria-disabled');el.style.pointerEvents='auto';function saveDraft(){ruleDrafts[gameId][f.key]=ruleControlValue(f,el)}el.addEventListener('input',saveDraft);el.addEventListener('change',function(){saveDraft();if(family==='go'&&f.key==='ruleset'){var p={chinese:{scoring:'area',komi:7.5,koRule:'simple',suicide:false},japanese:{scoring:'territory',komi:6.5,koRule:'simple',suicide:false},aga:{scoring:'area',komi:7.5,koRule:'superko',suicide:false},newzealand:{scoring:'area',komi:7,koRule:'superko',suicide:true}}[String(ruleDrafts[gameId].ruleset)];if(p)Object.assign(ruleDrafts[gameId],p)}if(family==='gomoku'&&f.key==='variant'&&ruleDrafts[gameId].variant==='connect6')ruleDrafts[gameId].opening='none';syncRuleControls(gameId,family,def,box)});box.appendChild(row)",
  "do not rebuild rule form on change"
);

const out = Buffer.from(source, "utf8");
const outputSha256 = createHash("sha256").update(out).digest("hex");
if (outputSha256 !== expectedSha256) throw new Error(`v0.0.21 worker SHA-256 mismatch: ${outputSha256}`);
if (!source.includes('const APP_VERSION = "0.0.21";')) throw new Error("v0.0.21 version patch missing");
if (!source.includes("syncRuleControls(gameId,family,def,box)")) throw new Error("v0.0.21 rule control sync patch missing");
if (source.includes("ruleDrafts[gameId].opening='none';renderRuleFields()")) throw new Error("stale rule-form rebuild handler remains");
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.21 worker.js (${out.length} bytes, SHA-256 ${outputSha256})`);
