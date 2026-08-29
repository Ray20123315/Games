# BoardVerse Cloudflare CI adapter

Cloudflare Workers Builds currently invokes `npx wrangler versions upload` from the repository root. The repository-local Wrangler shim under `node_modules/.bin/wrangler` adapts that fixed command safely:

- non-`main` branches use `ci/wrangler.preview.json` and upload a code-only preview without Durable Object lifecycle changes;
- `main` resolves the existing `boardverse` D1 binding at build time, injects the UUID only into an ephemeral config, and runs a full deploy using `ci/wrangler.production.template.json` against the canonical `crimson-haze-0a4d` Worker.

The D1 UUID and runtime secrets are never committed to this repository.
