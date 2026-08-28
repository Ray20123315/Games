# BoardVerse

BoardVerse v0.0.10 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 修正局內棋盤比例：棋盤改為固定原始幾何尺寸，再以單一 `scale(s)` 等比縮放；不再直接用不同 width/height 拉伸內容。
- 象棋固定使用 540×600 的 9:10 原始幾何；棋子按鈕與棋子本體明確使用相同寬高，避免圓形被 intrinsic sizing 撐成橢圓。
- 棋盤 viewport 維持 `overflow:hidden`；桌面依可用寬高 fit-contain，手機依可用寬度等比縮放並讓頁面自然增高。
- 公開房間桌面左側顯示「目前對局中」，右側顯示「等待玩家」；手機版上下排列，並支援房名／房號／棋類即時搜尋。
- finished 房不顯示；公開大廳只保留最近 24 小時仍 waiting/playing 的公開房。
- 回場密碼使用 PBKDF2-SHA256 100000 iterations，以符合 Cloudflare Workers runtime 上限。
- 繁體、简体、English、回放、觀戰、私人房審核、排隊輪替、觀眾獨立聊天室、落子／排隊提示音、自製 Popover/Modal/Toast、同房禁重名、60 秒離線自動認輸均保留。
- 房間網址：`https://多人棋室.ray2025.com/<ROOMCODE>`。

## Cloudflare Git Build

Root directory：`BoardVerse`

部署：

```bash
npx wrangler@latest deploy
```

`wrangler.jsonc` 的 custom build 依序執行 deterministic build/patch，最後強制驗證完整 `worker.js` SHA-256：

`2c8991be680545eced805c75ac882c40f44704fa034eb38fdc5deffbc50cbc47`

Durable Object：`ROOMS → GameRoom`，SQLite storage。
