# BoardVerse

BoardVerse v0.1.0 是以 Cloudflare Worker、SQLite-backed Durable Objects 與 Hibernation WebSocket 實作的多人棋室。

## 原始碼架構

`src/` 現在是唯一權威產品來源，Wrangler 入口固定為 `src/index.js`。舊版 gzip/Base64 source chunks 與 `post-build-v*.mjs` deterministic patch chain 不再參與正式建置。

為避免重構時改壞既有六種規則引擎與 v0.0.23 UI 行為，v0.0.23 最終生成結果以可讀 JavaScript 固定在 `src/legacy/runtime-v023.js` 作為 compatibility runtime；新的房間狀態、權限、棋鐘、Replay、帳號、會員、管理與 UI 擴充都已拆成一般 ES Modules。該 compatibility runtime 的固定 SHA-256 為：

`8f168113e24472377fec462bf61812e0b765a3707f72f7f6b249a6997e4a23e5`

保留的既有行為包含圍棋 9×9 / 13×13 / 19×19、五子棋、Renju、象棋、西洋棋、黑白棋、公開／私人房、房主審核、排隊輪替、玩家／觀眾分頻聊天、三語 UI、回場密碼、60 秒離線認輸、最近 12 局房內回放、雙欄公開大廳、搜尋、主題、規則設定與 v0.0.23 上一手標記。

## v0.1.0 功能

- Server-authoritative `revision + Event History + Snapshot`。
- 玩家 Ready；兩名玩家都 Ready 才開始。
- Spectator server-side role guard；語音房禁止觀戰與 spectator queue。
- 雙方同意 Undo，完整還原 game + clock snapshot，事件歷史保留。
- 雙方同意 Rematch，建立新 game instance、交換先後手／顏色並重新 Ready。
- 統一 Deadline Scheduler：棋鐘 timeout、玩家離線 60 秒、自訂房房主 grace 共用單一 DO alarm。
- `untimed`、`sudden_death`、Fischer、Bronstein Delay、Japanese Byo-yomi。
- 房間複製連結、支援時使用 Web Share；公開大廳棋種 Filter 與既有文字搜尋可同時使用。
- D1 Replay Archive：0～7 天不可猜測 Replay Link、8～30 天 Admin-only、滿 30 天每日 cleanup。
- 線上圖形化 Replay 與 self-contained 單檔離線 HTML Replay。
- Username + Email + Password 公開註冊、Email verification、Username/Email 登入、Forgot/Reset Password、可撤銷 7 天 Session。
- Resend `EmailService` abstraction。
- 五級免費會員、GP、每日簽到、有效活動 GP、自訂房號 entitlement、房主 grace、Room Preset。
- `GlobalChat` Durable Object、公告、房內／全局 Slow Mode 與不可關閉 hard rate limits。
- `/report` + Turnstile、處分申訴、Reputation、Risk Flags、刷分 heuristic、管理員人工審查。
- `/admin/*`：帳號／房間／遊戲／Replay／公告／Report／Global Chat／Risk／處分／Audit／Maintenance Mode。
- 管理員「終止目前遊戲」與「關閉整個房間」是兩個不同操作；管理員終止遊戲永遠是無結果，不可指定勝者。
- 1v1 P2P WebRTC Audio；僅使用 `stun:stun.cloudflare.com:3478`，不錄音、不使用 TURN/SFU，連線失敗不影響棋局與文字聊天。

會員等級只提供非競技便利功能，不會改變棋鐘、悔棋、先後手、勝負規則或任何勝率條件。

## Cloudflare 設定

Root directory：`BoardVerse`

部署／驗證：

```bash
npm install
npm test
npx wrangler deploy --dry-run --outdir dist
npx wrangler deploy
```

Durable Objects：

- `ROOMS → GameRoom`（SQLite）
- `GLOBAL_CHAT → GlobalChat`（SQLite）

Cron：`0 16 * * *` UTC（Asia/Taipei 每日 00:00）

### D1

程式固定使用 binding：`BOARDVERSE_DB`，database name 建議為 `boardverse`。Schema：`schema/boardverse.sql`。

Repository **不包含假的 `database_id`**。建立實際 D1 後，必須把 Cloudflare 回傳的真實 UUID 配到 `BOARDVERSE_DB`。

### Secrets / 外部設定

以下值只設定在 Cloudflare Secret／外部平台，不寫入 repository：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`

普通設定：

- `TURNSTILE_SITE_KEY`

Resend 寄件網域：`auth.ray2025.com`；建議寄件人：`BoardVerse <no-reply@auth.ray2025.com>`。DNS/domain verification 必須在 Resend 與 Cloudflare DNS 外部完成。
