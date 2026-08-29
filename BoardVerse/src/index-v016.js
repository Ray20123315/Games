import appV015, { GameRoom as GameRoomBase } from "./index-v015.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GameRoomV013,
  GameRoomV014,
  GameRoomV015,
  GlobalChat,
  GlobalChatV011,
} from "./index-v015.js";

function replayInterruptions(room, replay) {
  const startedAt = Number(replay?.startedAt || 0);
  const endedAt = Number(replay?.endedAt || Date.now());
  if (!startedAt || endedAt <= startedAt) return [];
  const events = Array.isArray(room?.bv?.events) ? room.bv.events : [];
  const relevant = events
    .filter((event) => {
      const at = Number(event?.serverTimestamp || 0);
      return at >= startedAt && at <= endedAt && (event?.type === "player_disconnected" || event?.type === "player_reconnected");
    })
    .sort((a, b) => Number(a.serverTimestamp || 0) - Number(b.serverTimestamp || 0));
  const open = new Map();
  const spans = [];
  for (const event of relevant) {
    const memberId = String(event?.actor?.memberId || event?.actor?.id || "");
    if (!memberId) continue;
    const at = Number(event.serverTimestamp || 0);
    if (event.type === "player_disconnected") {
      if (!open.has(memberId)) open.set(memberId, { from: at, name: event?.actor?.name || null });
    } else if (open.has(memberId)) {
      const item = open.get(memberId);
      open.delete(memberId);
      if (at > item.from) spans.push({ from: item.from, to: at, memberId, name: item.name });
    }
  }
  for (const [memberId, item] of open) {
    if (endedAt > item.from) spans.push({ from: item.from, to: endedAt, memberId, name: item.name });
  }
  return spans.sort((a, b) => a.from - b.from);
}

const REPLAY_PLAYER_STYLE = String.raw`<style id="boardverse-room-replay-player-style">
#replayOverlay .replay-dialog{transition:width .18s ease,max-height .18s ease}
#replayOverlay .replay-dialog.bv-replay-expanded{width:min(1400px,98vw);max-height:96vh}
#replayOverlay .replay-dialog.bv-replay-expanded .replay-layout{grid-template-columns:minmax(0,1.8fr) minmax(220px,.55fr)}
#replayOverlay .replay-stage{overflow:auto}
#replayOverlay .replay-dialog.bv-replay-expanded .replay-stage{min-height:min(72vh,820px)}
#bvReplayPlayerBar{display:grid;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#3b3327)}
#bvReplayPlayerBar .replay-controls{margin-top:0;display:grid;grid-template-columns:auto minmax(140px,1fr) auto;align-items:center;gap:8px}
#bvReplayPlayerBar #replayStep{text-align:center;margin:0}
.bv-replay-player-options{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
.bv-replay-player-options label{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 9px;border:1px solid var(--line,#3b3327);border-radius:10px;background:var(--panel2,#1d1912);font-size:12px;color:var(--text,#f3ede2)}
.bv-replay-player-options select{height:36px;border:1px solid var(--line,#3b3327);border-radius:10px;background:var(--panel2,#1d1912);color:var(--text,#f3ede2);padding:0 9px;font:inherit}
.bv-replay-player-options .btn{min-height:36px;height:36px;padding:0 11px}
#bvReplayTiming{width:100%;text-align:center;font-size:11px;color:var(--muted,#aa9e8b)}
@media(max-width:720px){#replayOverlay .replay-dialog.bv-replay-expanded .replay-layout{grid-template-columns:1fr}#bvReplayPlayerBar .replay-controls{grid-template-columns:auto minmax(100px,1fr) auto}}
</style>`;

const REPLAY_PLAYER_SCRIPT = String.raw`<script id="boardverse-room-replay-player">(function(){
'use strict';
var timer=null,playing=false,zoom=1;
function byId(id){return document.getElementById(id)}
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function stop(){playing=false;if(timer){clearTimeout(timer);timer=null}var b=byId('bvReplayPlay');if(b)b.textContent=text('自動播放','自动播放','Auto play')}
function speed(){var n=Number(byId('bvReplaySpeed')&&byId('bvReplaySpeed').value||1);return Number.isFinite(n)&&n>0?n:1}
function overlapMs(from,to,spans){var total=0;(spans||[]).forEach(function(span){var a=Math.max(from,Number(span.from)||0),b=Math.min(to,Number(span.to)||0);if(b>a)total+=b-a});return total}
function frameDelay(index){var data=window.__bvRoomReplayData,frames=data&&Array.isArray(data.frames)?data.frames:[];if(index<0||index>=frames.length-1)return 0;var preserve=!!(byId('bvReplayThinking')&&byId('bvReplayThinking').checked),skip=!!(byId('bvReplaySkipDisconnect')&&byId('bvReplaySkipDisconnect').checked),base=700;if(preserve){var from=Number(frames[index].at||0),to=Number(frames[index+1].at||0),delta=Math.max(0,to-from);if(skip&&delta>0)delta=Math.max(0,delta-overlapMs(from,to,data.interruptions));base=delta>0?delta:700}return Math.max(120,Math.round(base/speed()))}
function formatDelay(ms){if(ms<1000)return ms+' ms';return(ms/1000).toFixed(ms>=10000?0:1)+' 秒'}
function schedule(){if(timer){clearTimeout(timer);timer=null}if(!playing)return;var info=window.__bvRoomReplayFrame,data=window.__bvRoomReplayData;if(!info||!data||!Array.isArray(data.frames))return;var idx=Number(info.index)||0;if(idx>=data.frames.length-1){stop();return}var delay=frameDelay(idx),timing=byId('bvReplayTiming');if(timing)timing.textContent=text('下一手等待 ','下一手等待 ','Next move in ')+formatDelay(delay)+' · '+speed()+'×';timer=setTimeout(function(){timer=null;var next=byId('replayNext');if(next&&!next.disabled)next.click();else stop()},delay)}
function applyZoom(){var board=byId('replayBoard');if(!board)return;var base=parseFloat(board.style.maxWidth)||parseFloat(board.dataset.bvReplayBaseWidth)||board.getBoundingClientRect().width||540;board.dataset.bvReplayBaseWidth=String(base);var width=Math.round(base*zoom);board.style.setProperty('width',width+'px','important');board.style.setProperty('max-width',width+'px','important')}
function ensure(){var overlay=byId('replayOverlay'),dialog=overlay&&overlay.querySelector('.replay-dialog');if(!dialog)return;var bar=byId('bvReplayPlayerBar');if(!bar){bar=document.createElement('div');bar.id='bvReplayPlayerBar';var controls=dialog.querySelector('.replay-controls'),step=byId('replayStep');if(controls)bar.appendChild(controls);if(step)bar.appendChild(step);var options=document.createElement('div');options.className='bv-replay-player-options';options.innerHTML='<button class="btn" id="bvReplayPlay" type="button"></button><label>'+text('倍速','倍速','Speed')+' <select id="bvReplaySpeed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="4">4×</option></select></label><label><input id="bvReplayThinking" type="checkbox" checked> '+text('保留思考時間','保留思考时间','Keep think time')+'</label><label><input id="bvReplaySkipDisconnect" type="checkbox" checked> '+text('跳過斷線等待','跳过断线等待','Skip disconnect time')+'</label><label>'+text('棋盤大小','棋盘大小','Board size')+' <select id="bvReplayZoom"><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="1.75">175%</option></select></label><button class="btn ghost" id="bvReplayExpand" type="button">'+text('大視窗','大视窗','Large view')+'</button><div id="bvReplayTiming"></div>';bar.appendChild(options);dialog.appendChild(bar);byId('bvReplayPlay').onclick=function(){if(playing){stop();return}var data=window.__bvRoomReplayData,range=byId('replayRange');if(!data||!range)return;if(Number(range.value)>=Number(range.max)){range.value='0';range.dispatchEvent(new Event('input',{bubbles:true}))}playing=true;this.textContent=text('暫停播放','暂停播放','Pause');schedule()};byId('bvReplaySpeed').onchange=schedule;byId('bvReplayThinking').onchange=schedule;byId('bvReplaySkipDisconnect').onchange=schedule;byId('bvReplayZoom').onchange=function(){zoom=Math.max(1,Math.min(1.75,Number(this.value)||1));applyZoom()};byId('bvReplayExpand').onclick=function(){dialog.classList.toggle('bv-replay-expanded');this.textContent=dialog.classList.contains('bv-replay-expanded')?text('一般視窗','一般视窗','Normal view'):text('大視窗','大视窗','Large view');setTimeout(applyZoom,40)};byId('bvReplayPlay').textContent=text('自動播放','自动播放','Auto play')}
  applyZoom()
}
window.addEventListener('boardverse:room-replay-frame',function(){ensure();if(playing)schedule()});
window.addEventListener('boardverse:room-replay-close',stop);
document.addEventListener('keydown',function(e){if(e.key===' '&&!byId('replayOverlay')?.classList.contains('hidden')){var tag=String(document.activeElement&&document.activeElement.tagName||'').toLowerCase();if(tag!=='input'&&tag!=='select'&&tag!=='textarea'){e.preventDefault();var b=byId('bvReplayPlay');if(b)b.click()}}});
var observer=new MutationObserver(function(){if(byId('replayOverlay')&&!byId('replayOverlay').classList.contains('hidden'))ensure()});observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();</script>`;

const ADMIN_REPLAY_STYLE = String.raw`<style id="boardverse-admin-readable-replay-style">
.bv-readable-replays{min-width:940px}.bv-readable-replays td{max-width:260px;vertical-align:middle}.bv-readable-replays .bv-replay-players{font-weight:800}.bv-readable-replays .bv-replay-reason{color:var(--muted,#a9a18f);font-size:10px;margin-top:3px}.bv-readable-replays .bv-replay-game{font-weight:800;color:#f5e39a}.bv-readable-replays .bv-replay-winner{color:#dffbed;font-weight:900}.bv-readable-replays .bv-replay-view{height:32px}
</style>`;

const ADMIN_REPLAY_SCRIPT = String.raw`<script id="boardverse-admin-readable-replay">(function(){
'use strict';
var queued=false;
var GAMES={gomoku:'五子棋',renju:'連珠',go9:'圍棋 9×9',go13:'圍棋 13×13',go19:'圍棋 19×19',xiangqi:'象棋',xiangqi_random:'象棋・隨機布局',banqi:'暗棋',chess:'西洋棋',reversi:'黑白棋',qiguo:'七國象棋'};
function parse(v,fallback){try{return JSON.parse(v)}catch(e){return fallback}}
function side(game,code){if(!code)return'';if(game==='xiangqi'||game==='xiangqi_random'||game==='banqi')return code==='R'?'紅':code==='B'?'黑':code;if(game==='qiguo')return code;return code==='B'?'黑':code==='W'?'白':code}
function idx(headers,names){for(var i=0;i<headers.length;i++)if(names.indexOf(headers[i])>=0)return i;return-1}
function td(text,cls){var n=document.createElement('td');n.textContent=text==null?'—':String(text);if(cls)n.className=cls;return n}
function active(){var b=document.querySelector('[data-tab="replays"]');return!!(b&&b.classList.contains('active'))}
function enhance(){if(!active())return;var old=document.querySelector('#out table');if(!old||old.dataset.bvReadableReplay==='1')return;var headers=Array.from(old.querySelectorAll('thead th')).map(function(n){return String(n.textContent||'').trim()});var iId=idx(headers,['ID']),iRoom=idx(headers,['房號','room_id']),iGame=idx(headers,['棋類','game_type']),iVariant=idx(headers,['變種','variant']),iPlayers=idx(headers,['玩家資料','players_json']),iResult=idx(headers,['對局結果','result_json']),iFinished=idx(headers,['結束時間','finished_at']),iPublic=idx(headers,['公開期限','public_until']),iLife=idx(headers,['保存狀態','lifecycle']);if(iPlayers<0||iResult<0||iRoom<0)return;var table=document.createElement('table');table.className='bv-readable-replays';table.dataset.bvReadableReplay='1';var thead=document.createElement('thead'),hr=document.createElement('tr');['房號','棋類','對局者','勝者','結果','結束時間','公開至','保存狀態','操作'].forEach(function(h){var th=document.createElement('th');th.textContent=h;hr.appendChild(th)});thead.appendChild(hr);table.appendChild(thead);var tbody=document.createElement('tbody');Array.from(old.querySelectorAll('tbody tr')).forEach(function(row){var cells=Array.from(row.children),id=iId>=0?String(cells[iId]?.textContent||'').trim():'',room=String(cells[iRoom]?.textContent||'').trim(),game=String(cells[iGame]?.textContent||'').trim(),variant=iVariant>=0?String(cells[iVariant]?.textContent||'').trim():'',players=parse(String(cells[iPlayers]?.textContent||''),[]),result=parse(String(cells[iResult]?.textContent||''),null),tr=document.createElement('tr');tr.appendChild(td(room));var gameText=GAMES[game]||game||'—';if(variant&&variant!==game&&variant!=='null')gameText+=' · '+variant;tr.appendChild(td(gameText,'bv-replay-game'));var names=Array.isArray(players)?players.map(function(p){var s=side(game,p&&p.side);return String(p&&p.name||'玩家')+(s?'（'+s+'）':'')}).join(' vs '):'—';tr.appendChild(td(names,'bv-replay-players'));tr.appendChild(td(result&&result.winnerName?result.winnerName:(result&&result.winner?side(game,result.winner):'—'),'bv-replay-winner'));var resultCell=document.createElement('td'),reason=document.createElement('div');reason.textContent=result&&result.reason?result.reason:'—';resultCell.appendChild(reason);tr.appendChild(resultCell);tr.appendChild(td(iFinished>=0?cells[iFinished]?.textContent:'—'));tr.appendChild(td(iPublic>=0?cells[iPublic]?.textContent:'—'));tr.appendChild(td(iLife>=0?cells[iLife]?.textContent:'—'));var action=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='btn gold bv-replay-view';button.textContent='查看';button.onclick=function(){if(id)location.href='/admin/replay/'+encodeURIComponent(id)};action.appendChild(button);tr.appendChild(action);tbody.appendChild(tr)});table.appendChild(tbody);var wrap=old.parentElement;if(wrap)wrap.replaceChild(table,old)}
function schedule(){if(queued)return;queued=true;setTimeout(function(){queued=false;enhance()},0)}
var observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-tab="replays"]'))setTimeout(enhance,0)});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();</script>`;

function hookRoomReplayRuntime(source) {
  let body = String(source || "");
  body = body.replace(
    "function openReplay(data){if(!data||!Array.isArray(data.frames)||!data.frames.length){",
    "function openReplay(data){window.__bvRoomReplayData=data;if(!data||!Array.isArray(data.frames)||!data.frames.length){",
  );
  body = body.replace(
    "function closeReplay(){$('replayOverlay').classList.add('hidden');replayData=null;replayIndex=0}",
    "function closeReplay(){window.__bvRoomReplayData=null;window.__bvRoomReplayFrame=null;window.dispatchEvent(new Event('boardverse:room-replay-close'));$('replayOverlay').classList.add('hidden');replayData=null;replayIndex=0}",
  );
  body = body.replace(
    "renderGameBoard(frame.game,$('replayBoard'),false)}",
    "renderGameBoard(frame.game,$('replayBoard'),false);window.__bvRoomReplayFrame={index:replayIndex,frame:frame,data:replayData};window.dispatchEvent(new CustomEvent('boardverse:room-replay-frame',{detail:window.__bvRoomReplayFrame}))}",
  );
  return body;
}

function injectBeforeBody(source, snippet) {
  const body = String(source || "");
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${snippet}</body>`);
  return body + snippet;
}

function injectBeforeHeadEnd(source, snippet) {
  const body = String(source || "");
  if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, `${snippet}</head>`);
  return snippet + body;
}

export class GameRoom extends GameRoomBase {
  async sendReplay(ws, token, replayId) {
    const replay = this.room?.replays?.find((item) => String(item?.id) === String(replayId || "")) || null;
    const interruptions = replayInterruptions(this.room, replay);
    const originalSend = this.send;
    this.send = function patchedReplaySend(target, payload) {
      if (target === ws && payload?.type === "replay_data" && payload.replay) {
        payload = { ...payload, replay: { ...payload.replay, interruptions } };
      }
      return originalSend.call(this, target, payload);
    };
    try {
      return await super.sendReplay(ws, token, replayId);
    } finally {
      this.send = originalSend;
    }
  }
}
export class GameRoomV016 extends GameRoom {}

export default {
  async fetch(request, env, ctx) {
    const response = await appV015.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const url = new URL(request.url);
    let body = hookRoomReplayRuntime(await response.text());
    if (body.includes('id="replayOverlay"')) {
      if (!body.includes('id="boardverse-room-replay-player-style"')) body = injectBeforeHeadEnd(body, REPLAY_PLAYER_STYLE);
      if (!body.includes('id="boardverse-room-replay-player"')) body = injectBeforeBody(body, REPLAY_PLAYER_SCRIPT);
    }
    if (url.pathname.startsWith("/admin")) {
      if (!body.includes('id="boardverse-admin-readable-replay-style"')) body = injectBeforeHeadEnd(body, ADMIN_REPLAY_STYLE);
      if (!body.includes('id="boardverse-admin-readable-replay"')) body = injectBeforeBody(body, ADMIN_REPLAY_SCRIPT);
    }
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("cache-control", "no-store");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return appV015.scheduled(event, env, ctx);
  },
};
