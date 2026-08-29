import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry = fs.readFileSync(new URL('../src/index-v011.js', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

for (const href of ['/login', '/register', '/report', '/admin']) {
  assert.ok(entry.includes(`href=\"${href}\"`), `public navigation must expose ${href}`);
}
assert.ok(entry.includes('requestUrl.pathname === \"/admin\"'), '/admin must redirect to canonical admin route');
assert.ok(entry.includes('new URL(\"/admin/\", requestUrl)'), '/admin redirect must target /admin/');
for (const route of ['/register', '/login', '/report', '/admin/login', '/admin/']) {
  assert.ok(routes.includes(`path===\"${route}\"`), `route ${route} must exist`);
}
assert.match(entry, /APP_VERSION/);
console.log('public surface test passed');
