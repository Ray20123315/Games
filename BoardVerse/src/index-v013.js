import appV012 from "./index-v012.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoom,
  GameRoomV011,
  GameRoomV012,
  GlobalChat,
  GlobalChatV011,
} from "./index-v012.js";

const HOST_KICK_VISIBILITY_STYLE = String.raw`<style id="boardverse-host-kick-visibility-style">
#bvHostKickPanel.bv-host-kick-card{display:block;margin:0;padding:13px;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--panel);box-shadow:var(--shadow)}
#bvHostKickPanel.bv-host-kick-card.hidden{display:none!important}
#bvHostKickPanel .bv-host-kick-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
#bvHostKickPanel .bv-host-kick-title strong{font-size:14px}
#bvHostKickPanel .queue-row{padding:8px 0}
#bvHostKickPanel .queue-row .btn{flex:0 0 auto;min-height:34px;padding:6px 10px}
</style>`;

const HOST_KICK_VISIBILITY_SCRIPT = String.raw`<script id="boardverse-host-kick-visibility">
(function(){
'use strict';
function relocate(){
  var panel=document.getElementById('bvHostKickPanel');
  var side=document.querySelector('.side-stack');
  if(!panel||!side)return;
  panel.classList.add('bv-host-kick-card');
  if(panel.parentNode!==side)side.insertBefore(panel,side.firstChild);
  var first=panel.firstElementChild;
  if(first&&first.tagName==='STRONG'&&!first.parentElement.classList.contains('bv-host-kick-title')){
    var head=document.createElement('div');head.className='bv-host-kick-title';panel.insertBefore(head,first);head.appendChild(first);
  }
}
var observer=new MutationObserver(relocate);
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('boardverse:feature',function(){setTimeout(relocate,0)});
relocate();
})();
</script>`;

function injectHostKickVisibility(source) {
  let next = source;
  if (!next.includes('id="boardverse-host-kick-visibility-style"')) {
    if (/<\/head>/i.test(next)) next = next.replace(/<\/head>/i, `${HOST_KICK_VISIBILITY_STYLE}</head>`);
    else next = HOST_KICK_VISIBILITY_STYLE + next;
  }
  if (!next.includes('id="boardverse-host-kick-visibility"')) {
    if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${HOST_KICK_VISIBILITY_SCRIPT}</body>`);
    else next += HOST_KICK_VISIBILITY_SCRIPT;
  }
  return next;
}

export default {
  async fetch(request, env, ctx) {
    const response = await appV012.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const path = new URL(request.url).pathname;
    if (path.startsWith("/admin")) return response;
    const body = injectHostKickVisibility(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return appV012.scheduled(event, env, ctx);
  },
};
