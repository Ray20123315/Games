# ACTIVE_TASK

task_status: active
revision: 1

## Goal
Allow the room owner to kick any non-owner room member before, during, or after a game.

## Acceptance
- Only the owner can kick.
- Owner cannot kick self.
- Pending, queued, spectator, and seated members are removable.
- Kicking a seated player during `playing` ends that game with no result and no GP award, then returns the room to `waiting`.
- Kicked token sessions are terminated.
- Room references, deadlines, ready/rematch/undo state are cleaned.
- Owner UI exposes kick controls; non-owners receive no kickable member IDs.

## Constraints
- Preserve current runtime behavior and historical entrypoints.
- Avoid direct edits to the large legacy runtime.
- Do not update `main` directly; use a dedicated branch and PR.

## Plan
- [x] Inspect deployment entrypoint and room state model. Evidence: `wrangler.jsonc`, `src/index-v011.js`, `src/room/*`.
- [x] Implement versioned wrapper `src/index-v012.js` and owner UI.
- [x] Add static regression coverage and wire it into `npm test`.
- [~] Verify remote commit/diff and available CI/build evidence.
- [ ] Open PR and record final verification.

## Next action
Verify committed branch content and checks; then open PR.
