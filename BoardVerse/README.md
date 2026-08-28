# BoardVerse

BoardVerse v0.0.5 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 修正首頁語系初始化回歸：繁體、简体、English 均可正常顯示 8 種棋類與規則設定。
- 首頁／房號入口使用自然頁面高度；只有實際局內桌面版套用 16:9 工作區，手機維持直向響應式。
- 完成對局會在 Durable Object 中保留最近 12 局回放；房內可用自製回放視窗逐手查看棋盤與結果。
- 保留 v0.0.4：公開／私人房、玩家／觀戰、私人房審核、排隊輪替、觀眾獨立聊天室、三語 UI、落子／排隊提示音、自製 Popover/Modal/Toast、同房禁重名、選填回場密碼、60 秒離線自動認輸。
- 公開大廳只顯示最近 24 小時仍 waiting/playing 的公開房；finished 房立即移除。
- 房間網址：`https://多人棋室.ray2025.com/<ROOMCODE>`。

## Cloudflare Git Build

Root directory：`BoardVerse`

部署：

```bash
npx wrangler@latest deploy
```

`wrangler.jsonc` 的 custom build 會先執行 `node build-worker.mjs`，由 `.source/` 的 gzip/Base64 分片重建 `worker.js`，並強制驗證 SHA-256：

`fb0b4485498e2be629258d4f43bcda8ee5a335d4ea3723ad0f3d964468ab3fad`

Durable Object：`ROOMS → GameRoom`，SQLite storage。
