const PLATFORM_STYLE=String.raw`<style id="boardverse-v025-platform-parity-style">
.bv-bot a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);text-decoration:none;font-weight:900}
.bv-bot a:hover{border-color:var(--accent)}
</style>`;

const SINGLE_STYLE=String.raw`<style id="boardverse-v025-singleplayer-parity-style">
body.bv-singleplayer-v025 .topbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0;margin-bottom:12px}
body.bv-singleplayer-v025 .topbar .brand{margin-right:auto;display:flex;align-items:center;min-height:42px;font-size:20px;font-weight:1000;letter-spacing:.025em}
body.bv-singleplayer-v025 .topbar .sp{display:none}
body.bv-singleplayer-v025 .topbar>a:not(.brand){min-height:38px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);text-decoration:none;padding:0 10px;font-size:12px;font-weight:850}
body.bv-singleplayer-v025 .topbar>a:not(.brand):hover{border-color:var(--accent)}
body.bv-singleplayer-v025 #bvSingleLanguage{height:38px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);padding:0 9px;font:inherit;font-size:12px;font-weight:750}
body.bv-singleplayer-v025 .panel{min-width:0;margin:0;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 18px 48px #0004}
body.bv-singleplayer-v025 .catalog{padding:0;overflow:hidden}
body.bv-singleplayer-v025 .catalog summary{min-height:48px;padding:0 16px;background:var(--panel);color:var(--text);border:0;border-bottom:1px solid transparent;font-size:14px;font-weight:900}
body.bv-singleplayer-v025 .catalog details[open] summary{border-bottom-color:var(--line)}
body.bv-singleplayer-v025 .catalog summary:after{color:var(--accent2)}
body.bv-singleplayer-v025 .game-list{padding:12px}
body.bv-singleplayer-v025 .game-card{min-height:0;background:var(--panel2);box-shadow:none}
body.bv-singleplayer-v025 .setup .eyebrow{color:var(--accent2);letter-spacing:.1em}
body.bv-singleplayer-v025 .foot{display:flex;justify-content:space-between;gap:12px;padding:15px 2px 4px}
@media(max-width:620px){body.bv-singleplayer-v025 .topbar .brand{width:100%}body.bv-singleplayer-v025 .topbar>a:not(.brand),body.bv-singleplayer-v025 #bvSingleLanguage{flex:1}body.bv-singleplayer-v025 .foot{flex-direction:column}}
</style>`;

const SINGLE_SCRIPT=String.raw`<script id="boardverse-v025-singleplayer-i18n-script">(function(){'use strict';if(window.__BOARDVERSE_SINGLEPLAYER_V025__)return;window.__BOARDVERSE_SINGLEPLAYER_V025__=true;
var KEY='boardverseLang';
function $(q,r){return(r||document).querySelector(q)}function $$(q,r){return Array.from((r||document).querySelectorAll(q))}function set(n,v){if(n&&v!=null&&n.textContent!==v)n.textContent=v}function lang(){try{var v=localStorage.getItem(KEY)||'zh-Hant';return['zh-Hant','zh-Hans','en'].includes(v)?v:'zh-Hant'}catch(_){return'zh-Hant'}}
var T={
'zh-Hant':{html:'zh-Hant-TW',portal:'遊戲入口',boards:'棋盤',cards:'卡牌',catalog:'棋類與變種',eyebrow:'單人對戰 · 電腦棋手',title:'電腦對戰 · 5 級難度',intro:'這裡的「5 級」代表同一個 BoardVerse 電腦對手的五種強度，不是五個不同電腦棋手。單人棋局不使用多人房儲存額度。',current:'目前棋類',difficulty:'電腦難度',newGame:'開始新局',pass:'跳過',detail:'入門偏隨機；簡單加入基本吃子與位置偏好；普通以上逐步降低隨機性；困難與專家會優先選擇更高價值候選。所有合法性與勝負仍由 BoardVerse 標準棋規引擎判定。',choose:'選擇棋類後開始新局',start:'按「開始新局」開始',creating:'建立單人棋局…',thinking:'電腦思考中…',yourTurn:'你的回合',aiCountry:'電腦國家行動中…',aiTurn:'電腦回合',ended:'對局結束',rights:'© 2026 BoardVerse。保留所有權利。',levels:['','入門','簡單','普通','困難','專家']},
'zh-Hans':{html:'zh-Hans-CN',portal:'游戏入口',boards:'棋盘',cards:'卡牌',catalog:'棋类与变种',eyebrow:'单人对战 · 电脑棋手',title:'电脑对战 · 5 级难度',intro:'这里的“5 级”代表同一个 BoardVerse 电脑对手的五种强度，不是五个不同电脑棋手。单人棋局不使用多人房存储额度。',current:'当前棋类',difficulty:'电脑难度',newGame:'开始新局',pass:'跳过',detail:'入门偏随机；简单加入基本吃子与位置偏好；普通以上逐步降低随机性；困难与专家会优先选择更高价值候选。所有合法性与胜负仍由 BoardVerse 标准棋规引擎判定。',choose:'选择棋类后开始新局',start:'按“开始新局”开始',creating:'创建单人棋局…',thinking:'电脑思考中…',yourTurn:'你的回合',aiCountry:'电脑国家行动中…',aiTurn:'电脑回合',ended:'对局结束',rights:'© 2026 BoardVerse。保留所有权利。',levels:['','入門','简单','普通','困难','专家']},
en:{html:'en-US',portal:'Game portal',boards:'Boards',cards:'Cards',catalog:'Board games & variants',eyebrow:'Single-player · computer match',title:'Computer match · 5 difficulty levels',intro:'The five levels are five strengths of the same BoardVerse computer opponent, not five separate bots. Single-player games do not consume multiplayer room storage quota.',current:'Current game',difficulty:'Computer difficulty',newGame:'Start new game',pass:'Pass',detail:'Beginner is more random; Easy adds basic captures and positional preference; Normal and above reduce randomness; Hard and Expert prioritize higher-value candidates. Move legality and results are still decided by the BoardVerse canonical rules engine.',choose:'Choose a game, then start a new match',start:'Press “Start new game” to play',creating:'Creating single-player game…',thinking:'Computer is thinking…',yourTurn:'Your turn',aiCountry:'Computer countries are moving…',aiTurn:'Computer turn',ended:'Game over',rights:'© 2026 BoardVerse. All rights reserved.',levels:['','Beginner','Easy','Normal','Hard','Expert']}};
var G={
go9:{'zh-Hant':['圍棋 9×9','快速圍棋','9×9 小棋盤，適合快速單人對局。'],'zh-Hans':['围棋 9×9','快速围棋','9×9 小棋盘，适合快速单人对局。'],en:['Go 9×9','Quick Go','A compact 9×9 board for quick single-player games.']},
go13:{'zh-Hant':['圍棋 13×13','中型圍棋','13×13，在速度與布局深度之間取得平衡。'],'zh-Hans':['围棋 13×13','中型围棋','13×13，在速度与布局深度之间取得平衡。'],en:['Go 13×13','Medium Go','A 13×13 board balancing speed and strategic depth.']},
go19:{'zh-Hant':['圍棋 19×19','標準圍棋','19×19 標準棋盤；可跳過回合，規則沿用 BoardVerse 標準棋規引擎。'],'zh-Hans':['围棋 19×19','标准围棋','19×19 标准棋盘；可跳过回合，规则沿用 BoardVerse 标准棋规引擎。'],en:['Go 19×19','Standard Go','Standard 19×19 Go. Passing is supported and rules use the BoardVerse canonical engine.']},
gomoku:{'zh-Hant':['五子棋','自由五子棋','15×15，先形成五連者勝。'],'zh-Hans':['五子棋','自由五子棋','15×15，先形成五连者胜。'],en:['Gomoku','Freestyle Gomoku','15×15. The first player to make five in a row wins.']},
renju:{'zh-Hant':['連珠','黑方有禁手','15×15，黑方禁手與勝負判定由標準棋規引擎執行。'],'zh-Hans':['连珠','黑方有禁手','15×15，黑方禁手与胜负判定由标准棋规引擎执行。'],en:['Renju','Forbidden moves for Black','15×15 Renju. Forbidden moves and results are enforced by the canonical rules engine.']},
xiangqi:{'zh-Hant':['象棋','中國象棋','標準 9×10 中國象棋。'],'zh-Hans':['象棋','中国象棋','标准 9×10 中国象棋。'],en:['Xiangqi','Chinese chess','Standard 9×10 Xiangqi.']},
xiangqi_random:{'zh-Hant':['象棋・隨機布局','合法底線洗牌','底線採合法隨機布局，走法沿用象棋規則。'],'zh-Hans':['象棋・随机布局','合法底线洗牌','底线采用合法随机布局，走法沿用象棋规则。'],en:['Xiangqi · randomized setup','Legal back-rank shuffle','A legal randomized back-rank setup using standard Xiangqi movement rules.']},
banqi:{'zh-Hant':['暗棋（翻棋）','4×8 翻棋','32 子蓋牌；第一顆翻出的顏色決定你的陣營。'],'zh-Hans':['暗棋（翻棋）','4×8 翻棋','32 子盖牌；第一颗翻出的颜色决定你的阵营。'],en:['Banqi','4×8 dark chess','Thirty-two covered pieces; the first revealed color determines your side.']},
qiguo:{'zh-Hant':['七國象棋','19×19 · 單人七國','你控制秦國；其餘六國由電腦依序控制。'],'zh-Hans':['七国象棋','19×19 · 单人七国','你控制秦国；其余六国由电脑依次控制。'],en:['Seven Kingdoms Chess','19×19 · single-player','You control Qin; the other six kingdoms are controlled by the computer in turn.']},
chess:{'zh-Hant':['西洋棋','標準西洋棋','標準 8×8 西洋棋，升變預設為皇后。'],'zh-Hans':['国际象棋','标准国际象棋','标准 8×8 国际象棋，升变默认为皇后。'],en:['Chess','Standard chess','Standard 8×8 chess; promotion defaults to a queen.']},
reversi:{'zh-Hant':['黑白棋','翻轉棋','8×8，無棋可下時會自動跳過回合。'],'zh-Hans':['黑白棋','翻转棋','8×8，无棋可下时会自动跳过回合。'],en:['Reversi','Disk-flipping game','8×8. A turn is passed automatically when no legal move exists.']}}
;
function game(id){return(G[id]&&G[id][lang()])||G.gomoku[lang()]||G.gomoku['zh-Hant']}function selectedId(){var b=$('[data-game].on');return b?b.dataset.game:'gomoku'}
function ensureSelect(){var top=$('.topbar');if(!top)return;var s=$('#bvSingleLanguage');if(!s){s=document.createElement('select');s.id='bvSingleLanguage';s.setAttribute('aria-label','語言 / Language');s.innerHTML='<option value="zh-Hant">繁中</option><option value="zh-Hans">简中</option><option value="en">EN</option>';var first=$('.topbar>a:not(.brand)');top.insertBefore(s,first||null);s.addEventListener('change',function(){try{localStorage.setItem(KEY,this.value)}catch(_){}apply()})}s.value=lang()}
function translateStatus(d){var n=$('#status');if(!n)return;var raw=n.textContent.trim(),id=selectedId(),title=game(id)[0],out=raw;if(/選擇棋類後開始新局|选择棋类后开始新局|Choose a game/.test(raw))out=d.choose;else if(/按[「“]開始新局[」”]開始|Press .*Start new game/.test(raw))out=d.start+' '+title;else if(/建立單人棋局|创建单人棋局|Creating single-player/.test(raw))out=d.creating;else if(/電腦思考中|电脑思考中|Computer is thinking/.test(raw))out=d.thinking;else if(/你的回合|Your turn/.test(raw))out=d.yourTurn;else if(/電腦國家行動中|电脑国家行动中|Computer countries/.test(raw))out=d.aiCountry;else if(/電腦回合|电脑回合|Computer turn/.test(raw))out=d.aiTurn;else if(/對局結束|对局结束|Game over/.test(raw)){var parts=raw.split('·'),reason=parts.length>1?parts.slice(1).join('·').trim():'';out=d.ended+(reason?' · '+reason:'')}set(n,out)}
function apply(){document.body.classList.add('bv-singleplayer-v025');ensureSelect();var d=T[lang()]||T['zh-Hant'];document.documentElement.lang=d.html;var nav={'/play':d.portal,'/boards':d.boards,'/cards':d.cards};$$('.topbar>a:not(.brand)').forEach(function(a){var k=a.getAttribute('href');if(nav[k])set(a,nav[k])});var s=$('#bvSingleLanguage');if(s)s.value=lang();set($('.catalog summary'),d.catalog);set($('.setup .eyebrow'),d.eyebrow);set($('.setup h1'),d.title);var notes=$$('.setup>p.meta');set(notes[0],d.intro);set(notes[1],d.detail);var fields=$$('.setup .field>span');set(fields[0],d.current);set(fields[1],d.difficulty);set($('#new'),d.newGame);set($('#pass'),d.pass);$$('#levels [data-level]').forEach(function(b){var i=Number(b.dataset.level)||0;set(b,i+' · '+(d.levels[i]||i))});$$('[data-game]').forEach(function(b){var c=game(b.dataset.game),strong=$('strong',b),sp=$$('span',b);set(strong,c[0]);set(sp[0],c[1]);set(sp[1],c[2])});var g=game(selectedId());set($('#gameName'),g[0]);set($('#gameDesc'),g[2]);translateStatus(d);set($('.foot'),d.rights)}
var queued=false;function schedule(){if(queued)return;queued=true;queueMicrotask(function(){queued=false;apply()})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true})})();</script>`;

function beforeHead(source,snippet){return /<\/head>/i.test(source)?source.replace(/<\/head>/i,()=>snippet+'</head>'):snippet+source}
function beforeBody(source,snippet){return /<\/body>/i.test(source)?source.replace(/<\/body>/i,()=>snippet+'</body>'):source+snippet}
function platformCopy(source,path){let s=String(source||'');
  const zhHans=path==='/zh-cn', en=path==='/en-us';
  if(en){
    s=s.replaceAll('Enter /boards →','Open board games →').replaceAll('Enter /cards →','Open card games →').replaceAll('/singleplayer →','Open single-player →');
  }else if(zhHans){
    s=s.replaceAll('BOARDVERSE · BOARD & CARD GAMES','BOARDVERSE · 棋盘与卡牌游戏')
      .replaceAll('Texas Hold’em、Five-card Draw、UNO 兼容玩法、Crazy Eights。','德州扑克、五张抽牌扑克、UNO 兼容玩法、疯狂八点。')
      .replaceAll('进入 /boards →','进入棋盘游戏 →').replaceAll('进入 /cards →','进入卡牌游戏 →').replaceAll('/singleplayer →','进入单人对战 →')
      .replaceAll('电脑对战 · 5 级难度','电脑对战 · 5 级难度').replaceAll('支持全部 BoardVerse 棋盘游戏，提供 5 级难度，不依赖多人房 Durable Object 存储额度。','支持全部 BoardVerse 棋盘游戏，提供 5 级难度，不占用多人房存储额度。')
      .replaceAll('仅供娱乐；Poker 不提供真实货币下注、充值或兑现。','仅供娱乐；扑克不提供真实货币下注、充值或兑现。');
  }else{
    s=s.replaceAll('BOARDVERSE · BOARD & CARD GAMES','BOARDVERSE · 棋盤與卡牌遊戲')
      .replaceAll('Texas Hold’em、Five-card Draw、UNO 相容玩法、Crazy Eights。','德州撲克、五張抽牌撲克、UNO 相容玩法、瘋狂八點。')
      .replaceAll('進入 /boards →','進入棋盤遊戲 →').replaceAll('進入 /cards →','進入卡牌遊戲 →').replaceAll('/singleplayer →','進入單人對戰 →')
      .replaceAll('支援全部 BoardVerse 棋盤遊戲，提供 5 級難度，不依賴多人房 Durable Object 儲存額度。','支援全部 BoardVerse 棋盤遊戲，提供 5 級難度，不占用多人房儲存額度。')
      .replaceAll('僅供娛樂；Poker 不提供真實貨幣下注、儲值或兌現。','僅供娛樂；撲克不提供真實貨幣下注、儲值或兌現。');
  }
  if(!s.includes('boardverse-v025-platform-parity-style'))s=beforeHead(s,PLATFORM_STYLE);return s;
}
function cardCopy(source){let s=String(source||'');
  s=s.replace("if(brand)brand.innerHTML='BOARD<b>VERSE</b> · CARDS';","if(brand)brand.innerHTML='BOARD<b>VERSE</b> · '+(currentLang()==='en'?'CARDS':'卡牌');")
    .replace("['德州撲克 Texas Hold’em','Showdown 無下注','2～6 人。每人 2 張底牌，依序公開 Flop／Turn／River；每條街可停牌或棄牌，最後比較最佳五張牌。']","['德州撲克','攤牌制・無下注','2～6 人。每人 2 張底牌，依序公開翻牌／轉牌／河牌；每輪可停牌或棄牌，最後比較最佳五張牌。']")
    .replace("['德州扑克 Texas Hold’em','Showdown 无下注','2～6 人。每人 2 张底牌，依次公开 Flop／Turn／River；每条街可停牌或弃牌，最后比较最佳五张牌。']","['德州扑克','摊牌制・无下注','2～6 人。每人 2 张底牌，依次公开翻牌／转牌／河牌；每轮可停牌或弃牌，最后比较最佳五张牌。']")
    .replace("['五張抽牌撲克','Five-card Draw','2～6 人。每人 5 張牌，可更換 0～3 張一次，完成後直接攤牌比較。']","['五張抽牌撲克','一次換牌・無下注','2～6 人。每人 5 張牌，可更換 0～3 張一次，完成後直接攤牌比較。']")
    .replace("['五张抽牌扑克','Five-card Draw','2～6 人。每人 5 张牌，可更换 0～3 张一次，完成后直接摊牌比较。']","['五张抽牌扑克','一次换牌・无下注','2～6 人。每人 5 张牌，可更换 0～3 张一次，完成后直接摊牌比较。']")
    .replace("['Crazy Eights 八張鬼牌','52 張牌脫手遊戲'","['瘋狂八點','52 張牌脫手遊戲'")
    .replace("['Crazy Eights 八张鬼牌','52 张牌脱手游戏'","['疯狂八点','52 张牌脱手游戏'");
  return s;
}
export function enhanceV025Html(source,path=''){let s=String(source||'');if(['/home','/play','/zh-tw','/zh-cn','/en-us'].includes(path))return platformCopy(s,path);if(path==='/cards'||path.startsWith('/cards/'))return cardCopy(s);if(path==='/singleplayer'){if(!s.includes('boardverse-v025-singleplayer-parity-style'))s=beforeHead(s,SINGLE_STYLE);if(!s.includes('boardverse-v025-singleplayer-i18n-script'))s=beforeBody(s,SINGLE_SCRIPT);return s}return s}
