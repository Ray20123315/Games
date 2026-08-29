# ACTIVE_TASK

task_status: completed
revision: 1

## Goal
Allow the room owner to kick any non-owner room member before, during, or after a game.

## Acceptance
- [x] Only the owner can kick.
- [x] Owner cannot kick self.
- [x] Pending, queued, spectator, and seated members are removable.
- [x] Kicking a seated player during `playing` ends that game with no result and no GP award, then returns the room to `waiting`.
- [x] Kicked token sessions are terminated.
- [x] Room references, deadlines, ready/rematch/undo state are cleaned.
- [x] Owner UI exposes kick controls; non-owners receive no kickable member IDs.
- [x] Historical v011 Durable Object exports remain available.

## Completed plan
- [x] Inspect current deployment entrypoint and room state model.
- [x] Reuse existing PR #30 instead of creating a duplicate delivery PR.
- [x] Harden `src/index-v012.js` with bounded message parsing, revision checks, owner authorization, no-result active-game termination, queue-safe cleanup, and session termination.
- [x] Add `test/host-kick.test.mjs` and include it in `npm test`.
- [x] Verify exact remote blobs against locally tested files.
- [x] Confirm Cloudflare build/deployment success for PR head `cf69d22743e9e0818b514f8f45859d4ef6aca8be`.
- [x] Merge PR #30 into `main` as `a57b6596afc50ba53e81fb6e9625597f9c8098a2`.
- [x] Confirm PR head and merge commit have identical file trees (`compare_commits` returned no changed files).

## Result
Completed. No active blocker or pending next step.
