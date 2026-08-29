# DECISIONS

1. Keep the host-kick feature in the versioned `src/index-v012.js` compatibility layer rather than editing the large legacy runtime.
2. Reuse and strengthen existing PR #30 (`fix/host-kick-any-phase-v2`) instead of opening a duplicate PR.
3. Preserve the historical `BoardVerseDb`, `BoardVerseDbV011`, `GameRoomV011`, `GlobalChat`, and `GlobalChatV011` exports from `index-v011.js`.
4. Make kicking server-authoritative, bounded by `parseWsMessage`, revision-checked, and owner-only.
5. If a seated member is kicked during play, end the current game as no-result with `adminTerminated: true` internally so membership GP is not awarded, plus `hostTerminated: true` for provenance.
6. Temporarily disable queue rotation during that termination; after removal, return the room to `waiting`, promote an eligible queued player if present, and reset ready/clock/rematch/undo state.
7. Send kickable member IDs only to the owner and terminate the kicked token using the existing `endTokenSession` path.
8. The earlier `fix/host-kick-any-phase-v3` implementation is superseded by merged PR #30; do not treat its old code commit as authoritative.
