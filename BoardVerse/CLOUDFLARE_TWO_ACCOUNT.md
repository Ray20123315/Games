# BoardVerse 雙 Cloudflare 帳號部署（網域不搬家）

## 目標

- `ray2025.com` 與 `多人棋室.ray2025.com` 繼續留在原 Cloudflare 帳號。
- 原帳號只執行 `src/edge-proxy.js`，不再承擔 BoardVerse Durable Objects / D1。
- 新 Cloudflare 帳號執行真正 BoardVerse Origin：`src/origin-v022.js` + D1 + ROOM / Global Chat Durable Objects。
- 瀏覽器網址、Cookie domain、Turnstile hostname 都仍是原本的 `多人棋室.ray2025.com`。

## 為什麼這樣做

Cloudflare Custom Domain 必須位於該帳號擁有的 zone，所以不能直接把 `多人棋室.ray2025.com` 綁到另一個 Cloudflare 帳號的 Worker，而又完全不移動 zone。新帳號可以先使用自己的 `workers.dev` URL；舊帳號 Custom Domain Worker 再把流量 proxy 到新帳號 origin。

## 0. 不要先改正式 wrangler.jsonc

目前正式設定仍在 `wrangler.jsonc`。下列兩個檔案是切換用範本：

- 新帳號：`wrangler.origin.example.jsonc`
- 舊帳號：`wrangler.edge.example.jsonc`

在新 origin 完整驗證以前，不要把正式 custom domain 切到 edge proxy。

## 1. 新 Cloudflare 帳號建立 D1

在新帳號登入 Wrangler 後：

```bash
npx wrangler d1 create boardverse-main
```

把回傳的 D1 `database_id` 填入 `wrangler.origin.example.jsonc` 的：

```json
"database_id": "REPLACE_WITH_NEW_ACCOUNT_D1_DATABASE_ID"
```

Origin 使用 `BOARDVERSE_DB` 直接綁 D1，不再經過 `BOARDVERSE_DB_DO` RPC，因此網站帳號／Session／會員／後台 SQL 不會再放大成 Durable Object request。

## 2. 在新帳號設定 Secrets

把目前 BoardVerse 所需 Secrets 重新設定到新帳號。至少包含既有 Admin Secrets 與 Email/安全相關 Secrets；不要把 secret 值寫進 GitHub。

另外建立一組新的隨機 Edge shared secret：

```bash
npx wrangler secret put BOARDVERSE_EDGE_SHARED_SECRET --config wrangler.origin.example.jsonc
```

這個值稍後在舊帳號 edge Worker 設定成完全相同的值。

## 3. 部署新帳號 Origin

```bash
npx wrangler deploy --config wrangler.origin.example.jsonc
```

新 Worker 名稱預設為 `boardverse-origin`，會得到：

```text
https://boardverse-origin.<NEW_ACCOUNT_SUBDOMAIN>.workers.dev
```

先直接測 `/health`、登入頁、首頁與基本 API。此階段不要切正式網域。

## 4. 設定舊帳號 Edge Proxy

把新帳號 workers.dev URL 填入 `wrangler.edge.example.jsonc`：

```json
"BOARDVERSE_ORIGIN_URL": "https://boardverse-origin.<NEW_ACCOUNT_SUBDOMAIN>.workers.dev"
```

在舊帳號設定與新帳號相同的 shared secret：

```bash
npx wrangler secret put BOARDVERSE_EDGE_SHARED_SECRET --config wrangler.edge.example.jsonc
```

`src/edge-proxy.js` 會保留 path/query/cookie/websocket Upgrade，並附帶原始網站 origin。`src/origin-v022.js` 只有在 shared secret 正確時才信任這些 forwarded headers，並把應用內看到的 URL 恢復成 `https://多人棋室.ray2025.com/...`，避免 Email 驗證／重設連結生成成 workers.dev 網址。

## 5. 最後才切正式 hostname

確認新帳號 origin 正常後，在舊帳號部署：

```bash
npx wrangler deploy --config wrangler.edge.example.jsonc
```

這一步仍然綁原本的：

```text
xn--gmqt6w03b11v.ray2025.com
```

因此 `ray2025.com` zone 不需要搬到新帳號。

## 會員資料

### 現在

緊急 D1 模式已允許：

- ADMIN 使用原本 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 經一般 `/login` 建立 OWNER 對應帳號。
- 新會員註冊／登入／Session／會員資料直接使用 D1。

### 既有會員

若某個會員的 `users` / password hash / `user_sessions` 目前只存在已超額的舊 `BOARDVERSE_DB_DO`，在該 DO 無法讀取期間無法安全驗證舊密碼。不要用「接受任意密碼」或僅依 Username 恢復帳號。

待舊 DO 配額重置後，應先把舊資料庫完整搬到 D1，再做跨帳號 D1 export/import。至少需保留：

- `users`
- `user_sessions`
- `membership_daily`
- `room_presets`
- `disciplinary_actions`
- `chat_mutes`
- `settings`
- announcements/reports/audit/replay metadata 等正式資料

搬完並驗證 row count / login hash 後，才永久停止 `BOARDVERSE_DB_DO`。

## 回滾

若新 origin 有問題，只要在舊帳號把 custom domain Worker 重新部署回正式 `wrangler.jsonc` 所對應版本即可。因為 zone/DNS 沒搬，回滾不需要改 nameserver。
