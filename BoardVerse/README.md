# BoardVerse

BoardVerse v0.1.1 是以 Cloudflare Worker、SQLite-backed Durable Objects 與 Hibernation WebSocket 實作的多人棋室。

## 原始碼架構

`src/` 是唯一權威產品來源，Wrangler 正式入口固定為 `src/index-v011.js`。舊版 gzip/Base64 source chunks、`post-build-v*.mjs` 與 `sim-v*.mjs` deterministic patch chain 不再參與正式建置。

`build-worker.mjs` 現在只是一個 **Cloudflare Workers Builds 驗證 gate**：先跑完整 `npm test`，再執行 `wrangler deploy --dry-run`。它不再生成或 patch 正式 Worker 原始碼；驗證成功後，Cloudflare 既有 Deploy command `npx wrangler deploy` 才會真正部署 `src/index-v011.js`。

為避免重構時改壞既有遊戲規則與 UI 行為，v0.0.29 的最終生成結果以可讀 JavaScript 固定在 `src/legacy/runtime-v029.js` 作為 compatibility runtime；新的房間狀態、權限、棋鐘、Replay、帳號、會員、管理與 UI 擴充則拆成一般 ES Modules。

`src/legacy/runtime-v029.js` 固定 SHA-256：

`650d3f3e2931dc6ac214f0bbb3cea093ef6693b66e18ec020650e98ad35f043a`

保留的既有行為包含圍棋 9×9 / 13×13 / 19×19、五子棋、Renju、象棋、隨機象棋、暗棋、七國象棋、西洋棋、黑白棋、公開／私人房、房主審核、排隊輪替、玩家／觀眾分頻聊天、三語 UI、回場密碼、離線處理、房內回放、公開大廳、搜尋、主題、規則設定、上一手標記，以及 v0.0.24～v0.0.29 新增的開局／陣營配置與 UI 修正。

## v0.1.1 功能

- Server-authoritative `revision + Event History + Snapshot`。
- 玩家 Ready；一般雙人棋種需兩席均有人且雙方 Ready，七國象棋依動態席位數要求所有座位就緒。
- Spectator server-side role guard；1v1 語音房禁止觀戰與 spectator queue。
- 雙人棋種支援雙方同意 Undo，完整還原 game + clock snapshot，事件歷史保留；七國象棋不套用單一對手 Undo 模型。
- Rematch 採全體在席玩家確認；雙人棋種成功後交換先後手／顏色，七國象棋保留席位順序並重建國家分配。
- 統一 Deadline Scheduler：棋鐘 timeout、玩家離線、自訂房房主 grace 共用單一 DO alarm；七國象棋離線處理由 compatibility runtime 的多人淘汰規則處理。
- `untimed`、`sudden_death`、Fischer、Bronstein Delay、Japanese Byo-yomi；七國象棋目前固定 `untimed`，避免把多人國家回合錯誤映射到 1v1 side-keyed clock。
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
- 1v1 P2P WebRTC Audio；僅使用 `stun:stun.cloudflare.com:3478`，不錄音、不使用 TURN/SFU，連線失敗不影響棋局與文字聊天。七國象棋為 3～7 人，因此不啟用 1v1 語音。

會員等級只提供非競技便利功能，不會改變棋鐘、悔棋、先後手、勝負規則或任何勝率條件。

## 驗證

```bash
npm install
npm test
node build-worker.mjs
```

`node build-worker.mjs` 會再做一次完整 regression suite 與 Wrangler production dry-run。候選整合以 Node 22 與 Cloudflare Workers Builds 的 Node 24 環境驗證。

## Cloudflare 設定

目前 Git-connected Workers Build 使用：

- Root directory：`/BoardVerse`
- Build command：`node build-worker.mjs`
- Deploy command：`npx wrangler deploy`
- Production branch：`main`

非 production branch 由 Cloudflare Workers Builds 使用 preview version upload，不應切換正式流量。

### 正式網域與 Routing

`wrangler.jsonc` 直接宣告正式 hostname，不再依賴 repository root 的 deploy adapter：

- Worker Route：`xn--gmqt6w03b11v.ray2025.com/*`，zone `ray2025.com`
- Custom Domain：`xn--gmqt6w03b11v.ray2025.com`

保留兩者是為了接管既有環境中的 legacy catch-all Worker Route；Cloudflare Route 的匹配優先於同 hostname 的 Custom Domain，因此 route 必須同樣指向 `games`，否則舊 Worker 會先攔截請求。

### Durable Objects

目前 Wrangler binding：

- `ROOMS → GameRoom`（SQLite 既有 namespace）
- `BOARDVERSE_DB_DO → GameRoom`（使用同一既有 class 的獨立 named object 作 SQL persistence fallback）

### D1

程式固定使用 binding：`BOARDVERSE_DB`，database name 建議為 `boardverse`。Schema：`schema/boardverse.sql`。

Repository **不包含假的 `database_id`**。若使用 Wrangler 管理 D1 binding，必須把 Cloudflare 回傳的真實 UUID 配到 `BOARDVERSE_DB`；若已在 Cloudflare 端完成 binding，仍應在正式部署前確認部署流程不會移除該 binding。

### Secrets / 外部設定

以下值只設定在 Cloudflare Secret／外部平台，不寫入 repository：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY` — Turnstile widget secret；只放 Worker Secret，不能 commit。

普通設定：

- `TURNSTILE_SITE_KEY` — public widget site key。
- `TURNSTILE_HOSTNAMES` — comma-separated production hostnames accepted from Siteverify；production 不應包含 localhost。

Resend 寄件網域：`auth.ray2025.com`；建議寄件人：`BoardVerse <no-reply@auth.ray2025.com>`。DNS/domain verification 必須在 Resend 與 Cloudflare DNS 外部完成。
