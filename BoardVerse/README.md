# BoardVerse

BoardVerse v0.0.8 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 公開房間改成雙欄：桌面左側固定顯示「目前對局中」，右側固定顯示「等待玩家」；手機版自動改為上下排列。
- 加入公開房即時搜尋，可依房名、6 碼房號、棋類名稱過濾，不需要送出表單。
- 同一欄內維持最近活動優先；finished 房仍不顯示。
- 修正 Cloudflare Workers WebCrypto 的 PBKDF2 iteration 上限：回場密碼使用 100000 次。
- 繁體、简体、English 均可正常顯示 8 種棋類與規則設定。
- 首頁／房號入口使用自然頁面高度；只有實際局內桌面版套用 16:9 工作區，手機維持直向響應式。
- 完成對局會在 Durable Object 中保留最近 12 局回放；房內可用自製回放視窗逐手查看棋盤與結果。
- 保留公開／私人房、玩家／觀戰、私人房審核、排隊輪替、觀眾獨立聊天室、三語 UI、落子／排隊提示音、自製 Popover/Modal/Toast、同房禁重名、選填回場密碼、60 秒離線自動認輸。
- 公開大廳只顯示最近 24 小時仍 waiting/playing 的公開房；finished 房立即移除。
- 房間網址：`https://多人棋室.ray2025.com/<ROOMCODE>`。

## Cloudflare Git Build

Root directory：`BoardVerse`

部署：

```bash
npx wrangler@latest deploy
```

`wrangler.jsonc` 的 custom build 會先執行 `node build-worker.mjs`。建置流程先由已驗證的 v0.0.5 gzip/Base64 分片重建原始 Worker，再套用 deterministic patches，最後強制驗證完整 `worker.js` SHA-256：

`475e6c9c2331e5d4cdaee11bd394aaabe1d6fbf783d27f0814098f94455ccb7c`

Durable Object：`ROOMS → GameRoom`，SQLite storage。
