import fs from 'node:fs';

const input = fs.readFileSync('/tmp/prod.html', 'utf8');
const scripts = [...input.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]);
console.log('SCRIPT_COUNT', scripts.length);
const markers = {
  bridge: 'var NativeWS=window.WebSocket',
  legacy: 'var SERVER_GAMES=',
  enhance: "var $=function(id){return document.getElementById(id)}, feature=null",
  i18n: 'boardverse-site-i18n',
  policy: 'boardverse-feature-policy',
  pause: 'boardverse-admin-pause-notice',
};
for (const [name, marker] of Object.entries(markers)) {
  const hits = scripts.filter((s) => s.includes(marker));
  console.log(name, 'hits=', hits.length, 'bytes=', hits.reduce((n, s) => n + s.length, 0));
  let html = input;
  for (const script of hits) html = html.replace(script, `<!-- removed ${name} -->`);
  fs.writeFileSync(`/tmp/prod-no-${name}.html`, html);
}
// Keep only one script layer at a time as another cross-check.
for (const [name, marker] of Object.entries(markers)) {
  let html = input;
  for (const script of scripts) if (!script.includes(marker)) html = html.replace(script, '<!-- removed other script -->');
  fs.writeFileSync(`/tmp/prod-only-${name}.html`, html);
}
