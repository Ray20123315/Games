# DECISIONS

1. Add `src/index-v012.js` as a thin wrapper over `index-v011.js` instead of modifying the large legacy runtime.
2. Make kicking server-authoritative, revision-checked, and owner-only.
3. If a seated member is kicked during play, end the current game as no-result with `adminTerminated: true` internally so GP is not awarded; record `hostTerminated: true` for provenance.
4. Temporarily disable queue rotation during that termination, then restore queue settings and promote queued players only after the kicked member is removed.
5. Send kickable member IDs only to the owner.
