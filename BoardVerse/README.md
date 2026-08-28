# BoardVerse

多人棋類 Cloudflare Worker。部署後的應用程式仍是一支 `worker.js`；repo 內以經 SHA-256 驗證的 gzip/Base64 分片保存來源，`build-worker.mjs` 會在部署前重建原始 JS。

## 建置與部署

```bash
cd BoardVerse
node build-worker.mjs
npx wrangler@latest deploy
```

建置時會強制驗證 `worker.js` SHA-256：

`f171ff1da1094d156eef30a2bf9d313cd0f19e794b89d0b7aeb2a3e365916724`

`wrangler.jsonc` 已設定：

- Worker：`crimson-haze-0a4d`
- Durable Object binding：`ROOMS`
- Durable Object class：`GameRoom`
- Storage：SQLite

第一次以此設定部署時，Cloudflare 會依 Durable Object class export 建立／繫結 `GameRoom` namespace。
