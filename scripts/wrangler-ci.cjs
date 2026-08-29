#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REAL_WRANGLER = 'wrangler@4.127.1';
const PROD_HOSTNAME = 'xn--gmqt6w03b11v.ray2025.com';
const PROD_SERVICE = 'games';
const PROD_ZONE = 'ray2025.com';
const branch = process.env.WORKERS_CI_BRANCH || '';
const commitSha = process.env.WORKERS_CI_COMMIT_SHA || '';
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

async function apiRequest(method, pathname, payload = undefined) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) throw new Error('Workers Builds did not expose CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID to the deploy process.');
  const headers = { Authorization: `Bearer ${token}` };
  const options = { method, headers };
  if (payload !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload);
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${pathname}`, options);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.errors?.map((x) => `${x.code ? `${x.code}: ` : ''}${x.message}`).filter(Boolean).join('; ') || `HTTP ${res.status}`;
    throw new Error(`${method} ${pathname} failed: ${message}`);
  }
  return body.result;
}

const api = (pathname) => apiRequest('GET', pathname);

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
  const config = {
    name: PROD_SERVICE,
    main: 'BoardVerse/src/index-v011.js',
    compatibility_date: '2026-08-28',
    workers_dev: false,
    keep_vars: true,
    durable_objects: {
      bindings: [
        { name: 'ROOMS', class_name: 'GameRoom' },
        { name: 'BOARDVERSE_DB_DO', class_name: 'GameRoom' },
      ],
    },
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

async function attachAndVerifyDomain() {
  console.log(`[boardverse-ci] attaching custom domain ${PROD_HOSTNAME} -> ${PROD_SERVICE}`);
  const attached = await apiRequest('PUT', '/workers/domains', {
    hostname: PROD_HOSTNAME,
    service: PROD_SERVICE,
    zone_name: PROD_ZONE,
  });
  if (attached?.hostname !== PROD_HOSTNAME || attached?.service !== PROD_SERVICE) {
    throw new Error(`Workers Domains API returned unexpected result: ${JSON.stringify({ hostname: attached?.hostname, service: attached?.service })}`);
  }
  const domains = await api(`/workers/domains?hostname=${encodeURIComponent(PROD_HOSTNAME)}`);
  const rows = Array.isArray(domains) ? domains : [];
  const live = rows.find((item) => item?.hostname === PROD_HOSTNAME);
  if (!live || live.service !== PROD_SERVICE) {
    throw new Error(`Custom-domain read-back failed for ${PROD_HOSTNAME}; service=${live?.service || 'missing'}`);
  }
  console.log(`[boardverse-ci] custom domain verified: ${PROD_HOSTNAME} -> ${PROD_SERVICE}`);
}

(async () => {
  console.log(`[boardverse-ci] adapter active; branch=${branch || '(unknown)'}; production=${isProduction}`);

  let db = null;
  if (isWorkersBuild) {
    const gamesSettings = await settings(PROD_SERVICE);
    db = d1Binding(gamesSettings);
    console.log(`[boardverse-ci] games BOARDVERSE_DB binding: ${db ? 'present' : 'absent'}`);
    if (!db) {
      db = await d1ByName('boardverse');
      console.log(`[boardverse-ci] account D1 named boardverse: ${db ? 'present' : 'unavailable'}`);
    }
  }

  if (!isProduction) {
    process.exit(runReal(['versions', 'upload', '--config', 'wrangler.preview.jsonc']));
  }

  if (!commitSha) throw new Error('WORKERS_CI_COMMIT_SHA is required for an atomic production promotion.');
  const configPath = productionConfig(db?.database_id || null);
  const versionTag = `boardverse-${commitSha.slice(0, 16)}`;
  const message = `BoardVerse v0.1.1 ${commitSha.slice(0, 12)}`;
  console.log(`[boardverse-ci] production database backend: ${db?.database_id ? 'D1 + existing GameRoom fallback' : 'existing GameRoom SQLite fallback'}`);
  console.log(`[boardverse-ci] uploading full production version with tag ${versionTag}`);
  const uploadStatus = runReal(['versions', 'upload', '--config', configPath, '--tag', versionTag, '--message', message]);
  if (uploadStatus !== 0) process.exit(uploadStatus);
  console.log(`[boardverse-ci] promoting ${versionTag} to 100% production traffic`);
  const deployStatus = runReal(['versions', 'deploy', '--config', configPath, '--version-tag', versionTag, '-y', '--message', message]);
  if (deployStatus !== 0) process.exit(deployStatus);
  await attachAndVerifyDomain();
  process.exit(0);
})().catch((error) => {
  console.error(`[boardverse-ci] ${error.stack || error.message}`);
  process.exit(1);
});
