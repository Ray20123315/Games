import assert from 'node:assert/strict';
import { withDatabaseEnv } from '../src/core/db.js';

const calls = [];
const stub = {
  async query(mode, sql, binds) {
    calls.push({ mode, sql, binds });
    if (mode === 'first') return { value: binds[0] };
    if (mode === 'all') return { success: true, results: [{ value: binds[0] }], meta: { changes: 0 } };
    if (mode === 'run') return { success: true, meta: { changes: 1 } };
    return { success: true, meta: { changes: 0 } };
  },
};
const namespace = {
  getByName(name) {
    assert.equal(name, 'primary');
    return stub;
  },
};

const env = withDatabaseEnv({ BOARDVERSE_DB_DO: namespace, MARKER: 'ok' });
assert.equal(env.MARKER, 'ok');
assert.ok(env.BOARDVERSE_DB);
assert.deepEqual(await env.BOARDVERSE_DB.prepare('SELECT ? AS value').bind(7).first(), { value: 7 });
assert.deepEqual((await env.BOARDVERSE_DB.prepare('SELECT ? AS value').bind(8).all()).results, [{ value: 8 }]);
assert.equal((await env.BOARDVERSE_DB.prepare('UPDATE x SET y=?').bind(9).run()).meta.changes, 1);
assert.equal((await env.BOARDVERSE_DB.exec('CREATE TABLE x(y INTEGER)')).success, true);
assert.deepEqual(calls.map((x) => x.mode), ['first', 'all', 'run', 'exec']);

const nativeDb = { prepare() { throw new Error('not called'); } };
assert.equal(withDatabaseEnv({ BOARDVERSE_DB: nativeDb, BOARDVERSE_DB_DO: namespace }).BOARDVERSE_DB, nativeDb);
console.log('durable-db.test: PASS');
