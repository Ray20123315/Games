export const V023_POLISH_STYLE = String.raw`<style id="boardverse-v023-polish-style">
/* Keep the in-room settings workspace visually consistent across legacy and modern UI layers. */
#bvRoomSettingsWorkspace .bv-rs-grid{align-items:start!important;gap:12px!important}
#bvRoomSettingsWorkspace .bv-rs-field{align-content:start!important;gap:7px!important;min-width:0!important}
#bvRoomSettingsWorkspace .bv-rs-field>label:not(.bv-rs-check),#bvRoomSettingsWorkspace .bv-rs-section>label{min-height:18px;display:flex;align-items:center;line-height:1.35!important}
#bvRoomSettingsWorkspace .bv-rs-field>input:not([type="checkbox"]),#bvRoomSettingsWorkspace .bv-rs-field>select,#bvRoomSettingsWorkspace .bv-rs-presets input,#bvRoomSettingsWorkspace .bv-rs-presets select{width:100%!important;height:42px!important;min-height:42px!important;margin:0!important;padding:0 11px!important;border-radius:10px!important;box-sizing:border-box!important;line-height:1.2!important}
#bvRoomSettingsWorkspace .bv-rs-check{display:grid!important;grid-template-columns:21px minmax(0,1fr)!important;align-items:center!important;gap:9px!important;width:100%!important;min-height:42px!important;margin:0!important;padding:9px 11px!important;border-radius:10px!important;box-sizing:border-box!important;line-height:1.35!important}
#bvRoomSettingsWorkspace .bv-rs-check input[type="checkbox"]{width:21px!important;height:21px!important;min-width:21px!important;min-height:21px!important;margin:0!important;align-self:center!important}
#bvRoomSettingsWorkspace .bv-rs-check span{min-width:0!important;overflow-wrap:anywhere!important}
#bvRoomSettingsWorkspace .bv-rs-note{margin:0!important;line-height:1.55!important;overflow-wrap:anywhere!important}
#bvRoomSettingsWorkspace .bv-rs-actions .btn,#bvRoomSettingsWorkspace #bvRsSavePreset{height:42px!important;min-height:42px!important;padding:0 14px!important;margin:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;white-space:normal!important}
#bvRoomSettingsWorkspace .bv-rs-section{display:grid!important;gap:12px!important}
#bvRoomSettingsWorkspace .bv-rs-section>h3{margin:0!important;line-height:1.35!important}
#bvRoomSettingsWorkspace .bv-rs-presets{align-items:end!important;gap:10px!important}
.bv-home-brand-zh{display:inline-block;margin-left:9px;color:#c8b98c;font-size:12px;font-weight:900;letter-spacing:.08em;vertical-align:middle}
@media(max-width:720px){#bvRoomSettingsWorkspace .bv-rs-actions{width:100%!important}#bvRoomSettingsWorkspace .bv-rs-actions .btn{flex:1 1 130px!important}}
</style>`;

export const ADMIN_LOGIN_CENTER_STYLE = String.raw`<style id="boardverse-admin-login-center-fix">
html,body{width:100%!important;height:100%!important;min-height:100%!important;overflow:auto!important}
body{display:grid!important;place-items:center!important;padding:20px!important}
.login-frame{width:min(480px,92vw)!important;margin:auto!important;align-self:center!important;justify-self:center!important}
</style>`;

export const EMERGENCY_ADMIN_UI = String.raw`<style id="boardverse-emergency-admin-ui-style">
html[data-bv-emergency-admin="1"] .workspace{grid-template-rows:auto auto minmax(0,1fr)!important}
.bv-emergency-admin-note{padding:10px 12px;border:1px solid #876b25;border-radius:11px;background:#211a0d;color:#f4dfa0;font-size:11px;font-weight:800;line-height:1.55}
html[data-bv-emergency-admin="1"] [data-room-check]:disabled{opacity:.38!important;cursor:not-allowed!important}
</style><script id="boardverse-emergency-admin-ui">(function(){
'use strict';
function byId(id){return document.getElementById(id)}
function apply(){var frame=byId('adminFrame');if(!frame)return;document.documentElement.dataset.bvEmergencyAdmin='1';var workspace=frame.querySelector('.workspace');if(workspace&&!byId('bvEmergencyAdminNote')){var note=document.createElement('div');note.id='bvEmergencyAdminNote';note.className='bv-emergency-admin-note';note.textContent='緊急 D1 模式：管理後台會直接顯示目前 D1 緊急房間資料；需要 Durable Object 的暫停、恢復、終止與關房操作暫時停用。';var grid=workspace.querySelector('.content-grid');workspace.insertBefore(note,grid||workspace.lastChild)}['roomSelectAll','batchPause','batchResume','batchTerminate','batchClose','roomBatchReason'].forEach(function(id){var n=byId(id);if(n){n.disabled=true;n.setAttribute('aria-disabled','true')}});document.querySelectorAll('[data-room-check]').forEach(function(n){n.disabled=true;n.setAttribute('aria-disabled','true')})}
var queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;apply()})}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();</script>`;

function beforeHeadEnd(source, snippet) {
  const body = String(source || '');
  return /<\/head>/i.test(body) ? body.replace(/<\/head>/i, `${snippet}</head>`) : snippet + body;
}
function beforeBodyEnd(source, snippet) {
  const body = String(source || '');
  return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${snippet}</body>`) : body + snippet;
}
function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);
}

export function patchHomeShellRoutes(source) {
  return String(source || '')
    .replace("return u.pathname==='/'&&u.searchParams.get('play')!=='1'", "return (u.pathname==='/'||u.pathname==='/home')&&u.searchParams.get('play')!=='1'")
    .replaceAll('href="/?play=1"', 'href="/play"')
    .replace('<div class="bv-home-brand">BOARD<b>VERSE</b></div>', '<div class="bv-home-brand">BOARD<b>VERSE</b><span class="bv-home-brand-zh">棋盤宇宙</span></div>')
    .replace('BOARDVERSE · MULTIPLAYER BOARD GAMES', 'BOARDVERSE 棋盤宇宙 · MULTIPLAYER BOARD GAMES')
    .replace('<footer class="bv-home-foot"><span>BoardVerse</span>', '<footer class="bv-home-foot"><span>BoardVerse 棋盤宇宙</span>');
}

function injectSeo(source, requestUrl, pathname) {
  if (source.includes('id="boardverse-v023-seo"')) return source;
  const isHome = pathname === '/home';
  const isPlay = pathname === '/play';
  if (!isHome && !isPlay) return source;
  const pageUrl = new URL(pathname, requestUrl).href;
  const title = isHome ? 'BoardVerse 棋盤宇宙｜線上多人棋類遊戲' : 'BoardVerse 棋盤宇宙｜建立房間與遊戲設定';
  const description = isHome
    ? 'BoardVerse 棋盤宇宙是線上多人棋類平台，支援五子棋、圍棋、象棋、西洋棋、黑白棋、暗棋、連珠與七國象棋，可建立房間、觀戰與對局。'
    : '在 BoardVerse 棋盤宇宙建立多人棋局，設定棋類、規則、棋鐘、防切頁模式與房間選項。';
  const keywords = 'BoardVerse,棋盤宇宙,線上棋類,線上五子棋,線上圍棋,線上象棋,西洋棋,黑白棋,暗棋,連珠,七國象棋';
  const jsonLd = JSON.stringify({ '@context':'https://schema.org', '@type':'WebApplication', name:'BoardVerse 棋盤宇宙', alternateName:'BoardVerse', applicationCategory:'GameApplication', operatingSystem:'Web', inLanguage:['zh-Hant','zh-Hans','en'], url:pageUrl, description });
  const seo = `<meta id="boardverse-v023-seo" name="description" content="${escapeAttr(description)}"><meta name="keywords" content="${escapeAttr(keywords)}"><link rel="canonical" href="${escapeAttr(pageUrl)}"><meta property="og:type" content="website"><meta property="og:locale" content="zh_TW"><meta property="og:site_name" content="BoardVerse 棋盤宇宙"><meta property="og:title" content="${escapeAttr(title)}"><meta property="og:description" content="${escapeAttr(description)}"><meta property="og:url" content="${escapeAttr(pageUrl)}"><script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>`;
  let body = String(source || '').replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  return beforeHeadEnd(body, seo);
}

export function improveV023Html(source, { pathname = '', requestUrl = 'https://boardverse.invalid/', emergencyAdmin = false } = {}) {
  let body = patchHomeShellRoutes(source);
  if (!body.includes('id="boardverse-v023-polish-style"')) body = beforeHeadEnd(body, V023_POLISH_STYLE);
  if (body.includes('class="login-frame"') && !body.includes('id="boardverse-admin-login-center-fix"')) body = beforeHeadEnd(body, ADMIN_LOGIN_CENTER_STYLE);
  if (emergencyAdmin && body.includes('id="adminFrame"') && !body.includes('id="boardverse-emergency-admin-ui"')) body = beforeBodyEnd(body, EMERGENCY_ADMIN_UI);
  return injectSeo(body, requestUrl, pathname);
}
