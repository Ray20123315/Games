# BoardVerse

BoardVerse v0.0.12 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 補齊五子棋／Renju／Connect6 棋盤填滿且無勝方時的和棋終止條件，避免對局卡在無可落子但仍為 playing 的狀態。
- `pass` 由伺服器再次限制為圍棋 9×9／13×13／19×19；其他棋類即使偽造 WebSocket 訊息也不能虛手。
- 玩家主動認輸由 Durable Object 驗證仍在玩家席位，並完整寫入勝者／敗者 member id、名稱與 side，讓結束狀態、回放摘要與另一端顯示一致。
- 西洋棋建立新局時把初始局面加入 repetition history，三次重複判和會正確把起始局面計入。
- 象棋棋子尺寸改為跟棋盤容器寬度連動：點位約使用棋盤寬度的 8.6%，最大 48px；棋子本體放大到點位的 94%，並保持正圓。
- 象棋文字尺寸改用 container query units，避免手機／桌面因 viewport 不同導致棋子文字過小或過大。
- 圍棋／五子棋／Renju 的落子點會依棋盤路數分級：9×9 最大、13×13 次之、15×15 再縮小、19×19 最小，不再所有棋盤共用同一尺寸。
- 保留 v0.0.10 的固定原始幾何 + 單一 `scale(s)` 等比縮放，棋盤本身不可滾動。
- 公開房間桌面左側顯示「目前對局中」，右側顯示「等待玩家」；手機版上下排列並支援即時搜尋。
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

`wrangler.jsonc` 的 custom build 依序執行 deterministic build/patch。v0.0.11 層仍強制驗證完整 `worker.js` SHA-256：

`541ff63d982204bdc27256ed3f7f7788dd5a412551923c5476cea05645a19aa3`

v0.0.12 的 `post-build-v012.mjs` 以此 SHA 作為 source guard，所有 patch marker 都要求只命中一次，並在完成後輸出新的完整 `worker.js` SHA-256。

Durable Object：`ROOMS → GameRoom`，SQLite storage。
