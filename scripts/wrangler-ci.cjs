#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REAL_WRANGLER = 'wrangler@4.127.1';
const branch = process.env.WORKERS_CI_BRANCH || '';
const isWorkersBuild = process.env.WORKERS_CI === '1';
const isProduction = isWorkersBuild && branch === 'main';

function runReal(args) {
  const result = spawnSync('npx', ['--yes', REAL_WRANGLER, ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  return result.status == null ? 1 : result.status;
}

async function api(pathname) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('Workers Builds did not expose CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID to the deploy process.');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.errors?.map((x) => x.message).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body.result;
}

async function settings(worker) {
  try {
    return await api(`/workers/scripts/${encodeURIComponent(worker)}/settings`);
  } catch (error) {
    console.log(`[boardverse-ci] settings read unavailable for ${worker}: ${error.message}`);
    return null;
  }
}

function d1Binding(settingsValue) {
  return settingsValue?.bindings?.find((b) => b?.type === 'd1' && b?.name === 'BOARDVERSE_DB') || null;
}

async function d1ByName(name) {
  try {
    const result = await api(`/d1/database?name=${encodeURIComponent(name)}&per_page=20`);
    const rows = Array.isArray(result) ? result : [];
    const db = rows.find((row) => row?.name === name) || null;
    if (!db) return null;
    const id = db.uuid || db.id || db.database_id || null;
    return id ? { database_id: id } : null;
  } catch (error) {
    console.log(`[boardverse-ci] direct D1 discovery unavailable: ${error.message}`);
    return null;
  }
}

function productionConfig(databaseId) {
  const liveDoExports = Object.fromEntries([
    'GameRoom',
    'GlobalChat',
    'BoardVerseDb',
    'GameRoomV011',
    'GlobalChatV011',
    'BoardVerseDbV011',
  ].map((className) => [className, { type: 'durable-object', storage: 'sqlite' }]));

  const config = {
    name: 'games',
    main: 'BoardVerse/src/index-v011.js',
    compatibility_date: '2026-08-28',
    workers_dev: false,
    keep_vars: true,
    durable_objects: {
      bindings: [
        { name: 'ROOMS', class_name: 'GameRoomV011' },
        { name: 'GLOBAL_CHAT', class_name: 'GlobalChatV011' },
        { name: 'BOARDVERSE_DB_DO', class_name: 'BoardVerseDbV011' },
      ],
    },
    exports: liveDoExports,
    triggers: { crons: ['0 16 * * *'] },
    observability: { enabled: true },
    vars: {
      TURNSTILE_SITE_KEY: '0x4AAAAAAEgJg9Xf_BRP8k0b',
      TURNSTILE_HOSTNAMES: 'xn--gmqt6w03b11v.ray2025.com,多人棋室.ray2025.com',
    },
  };
  if (databaseId) {
    config.d1_databases = [
      { binding: 'BOARDVERSE_DB', database_name: 'boardverse', database_id: databaseId },
    ];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boardverse-wrangler-'));
  const file = path.join(dir, 'wrangler.production.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

(async () => {
  console.log(`[boardverse-ci] adapter active; branch=${branch || '(unknown)'}; production=${isProduction}`);

  let db = null;
  if (isWorkersBuild) {
    const gamesSettings = await settings('games');
    db = d1Binding(gamesSettings);
    console.log(`[boardverse-ci] games BOARDVERSE_DB binding: ${db ? 'present' : 'absent'}`);
    if (!db) {
      const legacySettings = await settings('crimson-haze-0a4d');
      db = d1Binding(legacySettings);
      console.log(`[boardverse-ci] legacy BOARDVERSE_DB binding: ${db ? 'present' : 'absent'}`);
    }
    if (!db) {
      db = await d1ByName('boardverse');
      console.log(`[boardverse-ci] account D1 named boardverse: ${db ? 'present' : 'unavailable'}`);
    }
  }

  if (!isProduction) {
    process.exit(runReal(['versions', 'upload', '--config', 'wrangler.preview.jsonc']));
  }

  const configPath = productionConfig(db?.database_id || null);
  console.log(`[boardverse-ci] production database backend: ${db?.database_id ? 'D1 + Durable fallback' : 'Durable SQLite fallback'}`);
  process.exit(runReal(['deploy', '--config', configPath]));
})().catch((error) => {
  console.error(`[boardverse-ci] ${error.stack || error.message}`);
  process.exit(1);
});
