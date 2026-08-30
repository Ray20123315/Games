import assert from 'node:assert/strict';
import { ensureDbSchema, withDatabaseEnv } from '../src/core/db.js';

const batchCalls = [];
function fakeD1(name) {
  return {
    prepare(sql) { return { sql }; },
    async batch(statements) {
      batchCalls.push({ name, statements: statements.map((statement) => statement.sql) });
      return statements.map(() => ({ success: true }));
    },
  };
}

const d1A = fakeD1('a');
const d1B = fakeD1('b');
await ensureDbSchema(d1A);
await ensureDbSchema(d1A);
await ensureDbSchema(d1B);
assert.equal(batchCalls.length, 2, 'schema readiness must be cached per database, not globally');
for (const call of batchCalls) {
  assert.ok(call.statements.length > 10, 'D1 schema must be split into complete statements');
  assert.match(call.statements[0], /^CREATE TABLE IF NOT EXISTS users \(/);
  assert.ok(call.statements.some((sql) => /^CREATE TABLE IF NOT EXISTS user_sessions \(/.test(sql)));
  assert.ok(call.statements.every((sql) => !sql.includes(';\nCREATE ')), 'D1 batch entries must contain one complete statement each');
}

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

const envAgain = withDatabaseEnv({ BOARDVERSE_DB_DO: namespace });
await ensureDbSchema(env.BOARDVERSE_DB);
await ensureDbSchema(envAgain.BOARDVERSE_DB);
assert.equal(calls.filter((x) => x.mode === 'exec').length, 2, 'same Durable Object database must initialize only once across wrappers');

const nativeDb = { prepare() { throw new Error('not called'); } };
assert.equal(withDatabaseEnv({ BOARDVERSE_DB: nativeDb, BOARDVERSE_DB_DO: namespace }).BOARDVERSE_DB, nativeDb);
console.log('durable-db.test: PASS');
