# BoardVerse

BoardVerse v0.0.20 是 Cloudflare Worker + Durable Object 的多人棋室。

本版重點：
- 建立房間的規則設定改為真正可持續編輯：`select`、`checkbox`、`number` 變更後不再重建整個規則表單。
- 每個棋種保留自己的 rule draft；切換語言或切到別的棋種再回來，已調整的規則仍會保留。
- 圍棋切換中國／日本／AGA／紐西蘭規則集時可同步常見預設，之後仍能逐項手動覆寫。
- `formRules()` 會提交畫面目前的規則值，讓建立房間時 Server 使用實際選擇，而不是重新落回 defaults。
- 五子棋與 Renju 在產品資訊架構中歸在同一組「五子棋與變種」；底層仍保留獨立 `renju` engine 以處理黑方禁手。
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

`wrangler.jsonc` 的 custom build 依序執行 deterministic build/patch，最後由 `post-build-v020.mjs` 驗證完整 `worker.js` SHA-256：

`b21985b6b7a24f527de38f43871ed7f14ead52aa496d16d0134c05442c0c4a13`

Durable Object：`ROOMS → GameRoom`，SQLite storage。
