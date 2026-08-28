# BoardVerse

多人棋類 Cloudflare Worker。v0.0.3 包含：

- 圍棋 9×9 / 13×13 / 19×19、五子棋、連珠、象棋、西洋棋、黑白棋。
- 公開房、私人房與房主審核。
- Hibernation WebSocket 即時同步與斷線重連。
- 房間聊天室：最多保留 100 則，每則最多 300 字；待審核申請者不能聊天。
- 各棋類獨立 SVG 棋盤 renderer；勝／敗／和局有明確結果橫幅。

部署後仍是一支 `worker.js`。Repository 以經 SHA-256 驗證的 gzip/Base64 分片保存來源，`build-worker.mjs` 會重建並核對內容。

## 建置與部署

Cloudflare Git Build 建議將 Root directory 設為 `BoardVerse`。`wrangler.jsonc` 已內建 custom build，因此 deploy 會先執行重建：

```bash
cd BoardVerse
npx wrangler@latest deploy
```

也可手動驗證：

```bash
cd BoardVerse
node build-worker.mjs
node --check worker.js
```

預期 `worker.js` SHA-256：

`fc1e6eb3abf5cb3ab744e4f8a2489908f5bdef498e64526f9b92ff81f70df3ba`

`wrangler.jsonc` 設定：

- Worker：`crimson-haze-0a4d`
- Durable Object binding：`ROOMS`
- Durable Object class：`GameRoom`
- Storage：SQLite
- Custom build：`node build-worker.mjs`

第一次成功部署時，Cloudflare 會依 Durable Object class export 建立／繫結 `GameRoom` namespace。
