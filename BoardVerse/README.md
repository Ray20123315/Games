# BoardVerse

BoardVerse v0.0.22 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 修正建立房間的規則設定：`select`、`checkbox`、`number` 變更後不再重建整個規則表單，因此可以持續編輯。
- 每個棋種保留自己的 rule draft；切換語言或切到其他棋種再回來，已調整的規則仍會保留。
- 圍棋切換中國／日本／AGA／紐西蘭規則集時會同步該規則集常見預設，之後仍可逐項手動覆寫。
- `formRules()` 會提交目前畫面／draft 的規則值，讓建立房間時 Server 使用實際選擇，而不是重新落回 defaults。
- 保留 v0.0.21 的圍棋 9×9、13×13、19×19 本地化 `Go` 分組，既有 game ID 與規則不變。
- 保留 v0.0.20 的「房主留桌」排隊模式、各棋種詳細規則設定說明，以及頂欄黑／白頁面主題控制。
- 五子棋與 Renju 仍歸在「五子棋與變種」產品分類；底層保留獨立 `renju` engine 處理黑方禁手。
- 保留 v0.0.19 的暖灰黑／象牙白頁面主題與柔和金色強調，不改棋盤本身配色。
- 象棋棋子尺寸跟棋盤容器寬度連動；圍棋／五子棋／Renju 落子點依棋盤路數分級。
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

`wrangler.jsonc` 的 custom build 依序執行 deterministic build/patch，最後由 `post-build-v022.mjs` 驗證完整 `worker.js` SHA-256：

`caec56b9b3642a057c6b2a3ef6b9d3db7a94dcac3e66359228bf515127131da8`

Durable Object：`ROOMS → GameRoom`，SQLite storage。
