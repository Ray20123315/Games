# BoardVerse

多人棋類 Cloudflare Worker。v0.0.4 主要功能：

- 圍棋 9×9 / 13×13 / 19×19、五子棋、Renju、象棋、西洋棋、Reversi。
- 各棋類可用的規則／變種設定由伺服器驗證，不提供未實作的假選項。
- 公開房／私人房；私人房以 `https://多人棋室.ray2025.com/<房號>` 進入，再選玩家或觀戰。
- 私人玩家入席審核；觀戰可直接進入；滿席時可依房間設定加入排隊。
- 房主可調整排隊順序並選擇「勝者留桌」或「雙方輪替」。
- 玩家聊天室與觀眾聊天室完全分流，玩家不會收到觀眾聊天內容。
- 繁體中文、簡體中文、English；自製 Popover / Modal / Toast，不使用原生 alert / confirm / prompt / title tooltip。
- 本地合成落子／提示音；排隊輪到時優先 Service Worker 通知，失敗則提示音。
- 可選回場密碼；房間內名稱不可重複。
- 玩家在進行中的棋局連續離線 60 秒會由 Durable Object Alarm 伺服器端自動判定認輸；60 秒內重連會取消。
- 公開房列表只顯示最近 24 小時有建立／活動且仍 waiting/playing 的公開房；finished 立即移除。
- 桌面採 16:9 主工作區，行動版改為安全重排避免整頁橫向溢位。

## 建置與部署

Cloudflare Git Build 的 Root directory 設為 `BoardVerse`。`wrangler.jsonc` 已設定 custom build，所以直接：

```bash
npx wrangler@latest deploy
```

也可先本機驗證：

```bash
node build-worker.mjs
node --check worker.js
```

預期 `worker.js` SHA-256：

`b598525c198309a7f1decca80e4c9fc1b400c35408bd1350aa11f59aec48bbf5`

Wrangler 內含：

- Worker：`crimson-haze-0a4d`
- Custom Domain：`xn--gmqt6w03b11v.ray2025.com`（`多人棋室.ray2025.com`）
- Durable Object binding：`ROOMS → GameRoom`
- Storage：SQLite
- Custom build：`node build-worker.mjs`
