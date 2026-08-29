# VERIFY

## Local verification
- `node --check` on the final PR `src/index-v012.js`: passed.
- Exact host-kick regression test content: 6 passed, 0 failed.

## Remote verification
- Final PR `src/index-v012.js` blob SHA: `8a81659eb14bf9e9775128ad0d0dfe1b2e969644`, matching the locally tested blob.
- Final PR `test/host-kick.test.mjs` blob SHA: `cb461d937e5c4043900b002f77db660ac7242b74`, matching the locally tested blob.
- Cloudflare bot reported deployment successful for PR head `cf69d22743e9e0818b514f8f45859d4ef6aca8be`.
- PR #30 merged successfully as `a57b6596afc50ba53e81fb6e9625597f9c8098a2`.
- `main` was re-read after merge and points to `a57b6596afc50ba53e81fb6e9625597f9c8098a2`.
- Comparing `cf69d227...` to merge commit `a57b6596...` returned an empty changed-files list, proving the successful Cloudflare build used the same file content now on `main`.

## Limitation
- GitHub Actions commit status was empty; verification came from the project test subset executed locally, exact remote blob matching, GitHub merge evidence, and Cloudflare Workers build/deployment evidence.
