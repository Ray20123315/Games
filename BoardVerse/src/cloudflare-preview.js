export default {
  fetch() {
    return Response.json({ ok: true, app: "BoardVerse", version: "0.1.1", mode: "preview-build-check" });
  },
};
