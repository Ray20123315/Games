import { readFile, writeFile } from "node:fs/promises";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.replace(from, to);
}
function insertBefore(marker, text, label) {
  const first = source.indexOf(marker);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(marker, first + marker.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.slice(0, first) + text + source.slice(first);
}

replaceExact('const APP_VERSION = "0.0.23";', 'const APP_VERSION = "0.0.24";', 'version');

replaceExact(
`  xiangqi: {
    id: "xiangqi",
    family: "xiangqi",
    title: "象棋",
    short: "中國象棋",
    description: "標準 9×10 棋盤，含將帥照面、馬腿、象眼、炮架、過河兵與王手合法性檢查；無合法步時判負。",
  },
  chess: {`,
`  xiangqi: {
    id: "xiangqi",
    family: "xiangqi",
    title: "象棋",
    short: "中國象棋",
    description: "標準 9×10 棋盤，含將帥照面、馬腿、象眼、炮架、過河兵與王手合法性檢查；無合法步時判負。",
  },
  banqi: {
    id: "banqi",
    family: "banqi",
    title: "暗棋 Banqi",
    short: "4×8 翻棋",
    description: "4×8 格、32 子背面隨機鋪滿。首翻棋色決定雙方陣營；一般棋直走一格並依階級吃子，炮隔一子跳吃。採台灣常見規則。",
  },
  xiangqi_random: {
    id: "xiangqi_random",
    family: "xiangqi",
    title: "隨機布局象棋",
    short: "底線洗牌",
    description: "保留將帥與士的九宮合法起點，將雙方底線的車、馬、象六子用同一隨機排列洗牌；其餘走法與標準象棋相同。",
  },
  chess: {`,
'game catalog variants');

replaceExact(
`  xiangqi: {
    defaults: { stalemateLoss:true },
    fields: [
      { key:"stalemateLoss", label:"困斃判負", type:"checkbox", help:"標準象棋中輪到一方卻完全沒有合法著法時，該方負；這和西洋棋 Stalemate 判和不同。" },
    ],
    extraHelp:"暗棋 Banqi、揭棋 Jieqi、Janggi 需要不同棋盤／隱藏資訊或走法引擎，會以獨立遊戲模式加入，不會只靠一個開關冒充。"
  },
  chess: {`,
`  xiangqi: {
    defaults: { stalemateLoss:true },
    fields: [
      { key:"stalemateLoss", label:"困斃判負", type:"checkbox", help:"標準象棋中輪到一方卻完全沒有合法著法時，該方負；這和西洋棋 Stalemate 判和不同。" },
    ],
    extraHelp:"隨機布局象棋保留將帥與士的合法起點，只洗牌車、馬、象六子；七國象棋需要七席房間架構，廣象戲完整棋譜已失傳，因此不會用不完整規則冒充可玩版本。"
  },
  banqi: {
    defaults: { ruleset:"taiwan" },
    fields: [],
    extraHelp:"採台灣常見暗棋：4×8 格、首翻定色；帥/將 > 仕/士 > 相/象 > 俥/車 > 傌/馬 > 炮/砲 > 兵/卒。兵卒可吃將帥、將帥不可吃兵卒；炮吃子必須隔剛好一子，且可吃任何階級。"
  },
  chess: {`,
'rule defs variants');

replaceExact(
`function sideFor(gameId, seat) {
  if (gameId === "chess") return seat === 0 ? "W" : "B";
  if (gameId === "xiangqi") return seat === 0 ? "R" : "B";
  return seat === 0 ? "B" : "W";
}`,
`function sideFor(gameId, seat) {
  if (gameId === "chess") return seat === 0 ? "W" : "B";
  if (gameId === "xiangqi" || gameId === "xiangqi_random") return seat === 0 ? "R" : "B";
  if (gameId === "banqi") return seat === 0 ? "P1" : "P2";
  return seat === 0 ? "B" : "W";
}`,
'side mapping');

replaceExact(
`  if (gameId === "xiangqi") return newXiangqi(rules);
  if (gameId === "chess") return newChess(rules);`,
`  if (gameId === "xiangqi") return newXiangqi(rules);
  if (gameId === "xiangqi_random") return newRandomXiangqi(rules);
  if (gameId === "banqi") return newBanqi(rules);
  if (gameId === "chess") return newChess(rules);`,
'new game variants');

replaceExact(
`function publicGameState(game) {
  const out = structuredClone(game);
  if (out?.type === "go" && !out.ended) {`,
`function publicGameState(game) {
  const out = structuredClone(game);
  if (out?.type === "banqi" && Array.isArray(out.board)) out.board = out.board.map((cell) => cell && !cell.up ? { up:false } : cell);
  if (out?.type === "go" && !out.ended) {`,
'banqi hidden public state');

replaceExact(
`  if (game.type === "xiangqi") return applyXiangqi(game, side, msg);
  if (game.type === "chess") return applyChess(game, side, msg);`,
`  if (game.type === "xiangqi") return applyXiangqi(game, side, msg);
  if (game.type === "banqi") return applyBanqi(game, side, msg);
  if (game.type === "chess") return applyChess(game, side, msg);`,
'banqi action dispatch');

insertBefore('// ---------- Xiangqi ----------', `// ---------- Banqi / random Xiangqi ----------
function shuffleRuntime(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const buf = crypto.getRandomValues(new Uint32Array(1));
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newBanqi(rules = normalizeRules("banqi", {})) {
  const one = (color) => [color+"K",color+"A",color+"A",color+"E",color+"E",color+"R",color+"R",color+"H",color+"H",color+"C",color+"C",color+"P",color+"P",color+"P",color+"P",color+"P"];
  const pieces = shuffleRuntime(one("r").concat(one("b")));
  return { type:"banqi", rows:4, cols:8, board:pieces.map((p)=>({p,up:false})), turn:"P1", colors:{P1:null,P2:null}, moveNumber:0, ended:false, lastMove:null, rules };
}

function otherBanqiSeat(side) { return side === "P1" ? "P2" : "P1"; }
function banqiPieceColor(piece) { return piece?.[0] === "r" ? "R" : piece?.[0] === "b" ? "B" : null; }
function banqiCanRankCapture(attacker, target) {
  const a = attacker?.[1], t = target?.[1];
  if (!a || !t || a === "C") return false;
  if (a === "P") return t === "P" || t === "K";
  if (a === "K" && t === "P") return false;
  const rank = {K:7,A:6,E:5,R:4,H:3,C:2,P:1};
  return (rank[a] || 0) >= (rank[t] || 0);
}
function banqiAdjacent(from, to) {
  const fr=Math.floor(from/8),fc=from%8,tr=Math.floor(to/8),tc=to%8;
  return Math.abs(fr-tr)+Math.abs(fc-tc)===1;
}
function banqiCannonCapture(board, from, to) {
  const fr=Math.floor(from/8),fc=from%8,tr=Math.floor(to/8),tc=to%8;
  if (fr!==tr && fc!==tc) return false;
  const dr=Math.sign(tr-fr),dc=Math.sign(tc-fc); let r=fr+dr,c=fc+dc,screens=0;
  while(r!==tr||c!==tc){if(board[r*8+c])screens++;r+=dr;c+=dc;}
  return screens===1;
}
function banqiCanMove(game, side, from, to) {
  if (!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>=32||to<0||to>=32||from===to) return false;
  const color=game.colors?.[side], src=game.board[from], dst=game.board[to];
  if (!color || !src?.up || banqiPieceColor(src.p)!==color) return false;
  if (dst && !dst.up) return false;
  if (!dst) return banqiAdjacent(from,to);
  if (banqiPieceColor(dst.p)===color) return false;
  if (src.p[1]==="C") return banqiCannonCapture(game.board,from,to);
  return banqiAdjacent(from,to) && banqiCanRankCapture(src.p,dst.p);
}
function banqiHasAction(game, side) {
  if (game.board.some((cell)=>cell && !cell.up)) return true;
  for (let from=0;from<32;from++) for (let to=0;to<32;to++) if (banqiCanMove(game,side,from,to)) return true;
  return false;
}
function applyBanqi(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const next=structuredClone(game), from=Number(msg.from), other=otherBanqiSeat(side);
  if (msg.action === "flip") {
    if (!Number.isInteger(from)||from<0||from>=32||!next.board[from]||next.board[from].up) throw new Error("這一格不能翻棋。");
    next.board[from].up=true;
    if (!next.colors[side]) {
      const color=banqiPieceColor(next.board[from].p);
      next.colors[side]=color; next.colors[other]=color==="R"?"B":"R";
    }
    next.moveNumber++; next.lastMove={from,to:from,side,flip:true}; next.turn=other;
  } else {
    const to=Number(msg.to);
    if (!banqiCanMove(next,side,from,to)) throw new Error("此步不符合暗棋規則。");
    next.board[to]=next.board[from]; next.board[from]=null;
    next.moveNumber++; next.lastMove={from,to,side}; next.turn=other;
  }
  if (!banqiHasAction(next,other)) { next.ended=true; return {game:next,ended:true,result:{winner:side,reason:"對手已無合法翻棋、移動或吃子"}}; }
  return {game:next,ended:false};
}

function newRandomXiangqi(rules = normalizeRules("xiangqi_random", {})) {
  const g = newXiangqi(rules);
  const slots=[0,1,2,6,7,8], types=shuffleRuntime(["R","H","E","E","H","R"]);
  for (let i=0;i<slots.length;i++) { const c=slots[i]; g.board[c]="b"+types[i]; g.board[9*9+c]="r"+types[i]; }
  g.variant="random_back_rank";
  return g;
}

`, 'banqi functions');

replaceExact(
`      startedAt: Date.now(), players, initialGame: publicGameState(room.game), actions: [], partial: false,`,
`      startedAt: Date.now(), players, initialGame: room.game?.type === "banqi" ? structuredClone(room.game) : publicGameState(room.game), actions: [], partial: false,`,
'private banqi replay seed');

replaceExact(
`  if (msg?.action === "pass") out.action = "pass";`,
`  if (msg?.action === "pass" || msg?.action === "flip") out.action = msg.action;`,
'replay flip action');

replaceExact(
`      settings: defaultRoomSettings(body.settings || {}),
      createdAt: now,
      updatedAt: now,
      status: "waiting",`,
`      settings: defaultRoomSettings(body.settings || {}),
      createdAt: now,
      startedAt: null,
      endedAt: null,
      updatedAt: now,
      status: "waiting",`,
'room timing init');

replaceExact(
`      room.game = newGame(room.gameId, room.rules);
      room.status = "playing";
      room.result = null;`,
`      room.game = newGame(room.gameId, room.rules);
      room.status = "playing";
      room.startedAt = Date.now();
      room.endedAt = null;
      room.result = null;`,
'match start timing');

replaceExact(
`    room.status = "finished";
    room.result = { ...result, ...publicResult, loserMemberId: result?.loserMemberId || loser?.id || null, loserName: result?.loserName || loser?.name || null };`,
`    room.status = "finished";
    room.endedAt = Date.now();
    room.result = { ...result, ...publicResult, loserMemberId: result?.loserMemberId || loser?.id || null, loserName: result?.loserName || loser?.name || null };`,
'match end timing');

replaceExact(
`      queueLength: r.queue.length, createdAt: r.createdAt, updatedAt: r.updatedAt,`,
`      queueLength: r.queue.length, createdAt: r.createdAt, startedAt: r.startedAt || r.currentReplay?.startedAt || 0, endedAt: r.endedAt || 0, updatedAt: r.updatedAt,`,
'lobby record timing');

replaceExact(
`    createdAt: Number(r.createdAt) || Date.now(), updatedAt: Number(r.updatedAt) || Date.now(),`,
`    createdAt: Number(r.createdAt) || Date.now(), startedAt: Number(r.startedAt) || 0, endedAt: Number(r.endedAt) || 0, updatedAt: Number(r.updatedAt) || Date.now(),`,
'lobby sanitize timing');

replaceExact(
`<option value="renju">連珠 Renju</option><option value="xiangqi">象棋</option><option value="chess">西洋棋</option>`,
`<option value="renju">連珠 Renju</option><option value="xiangqi">象棋</option><option value="banqi">暗棋 Banqi</option><option value="xiangqi_random">隨機布局象棋</option><option disabled>七國象棋（需要 7 人房間）</option><option disabled>廣象戲（完整規則已失傳）</option><option value="chess">西洋棋</option>`,
'game select variants');

replaceExact(
`  xiangqi:{zhHant:["象棋","中國象棋"],zhHans:["象棋","中国象棋"],en:["Xiangqi","Chinese Chess"]},
  chess:`,
`  xiangqi:{zhHant:["象棋","中國象棋"],zhHans:["象棋","中国象棋"],en:["Xiangqi","Chinese Chess"]},
  banqi:{zhHant:["暗棋 Banqi","4×8 翻棋"],zhHans:["暗棋 Banqi","4×8 翻棋"],en:["Banqi","Chinese Dark Chess"]},
  xiangqi_random:{zhHant:["隨機布局象棋","底線洗牌"],zhHans:["随机布局象棋","底线洗牌"],en:["Random Xiangqi","Shuffled back rank"]},
  chess:`,
'client game names');

replaceExact(
`function sideName(gameId,s){if(gameId==='chess')return s==='W'?(lang==='en'?'White':lang==='zh-Hans'?'白方':'白方'):(lang==='en'?'Black':'黑方');if(gameId==='xiangqi')return s==='R'?(lang==='en'?'Red':lang==='zh-Hans'?'红方':'紅方'):(lang==='en'?'Black':'黑方');return s==='B'?(lang==='en'?'Black':'黑方'):(lang==='en'?'White':'白方')}`,
`function sideName(gameId,s){if(gameId==='chess')return s==='W'?(lang==='en'?'White':lang==='zh-Hans'?'白方':'白方'):(lang==='en'?'Black':'黑方');if(gameId==='xiangqi'||gameId==='xiangqi_random')return s==='R'?(lang==='en'?'Red':lang==='zh-Hans'?'红方':'紅方'):(lang==='en'?'Black':'黑方');if(gameId==='banqi')return s==='P1'?(lang==='en'?'Player 1':lang==='zh-Hans'?'玩家 1':'玩家 1'):(lang==='en'?'Player 2':lang==='zh-Hans'?'玩家 2':'玩家 2');return s==='B'?(lang==='en'?'Black':'黑方'):(lang==='en'?'White':'白方')}`,
'client side names');

replaceExact(
`function intrinsicBoardSize(g){if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){`,
`function intrinsicBoardSize(g){if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='banqi')return{w:720,h:360};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){`,
'banqi intrinsic size');

replaceExact(
`function renderGameBoard(g,el,interactive){if(!g||!el)return;el.textContent='';if(g.type==='go'||g.type==='gomoku'||g.type==='renju')renderIntersectionBoard(g,el,interactive);else if(g.type==='xiangqi')renderXiangqi(g,el,interactive);else renderSquareBoard(g,el,interactive)}`,
`function renderGameBoard(g,el,interactive){if(!g||!el)return;el.textContent='';if(g.type==='go'||g.type==='gomoku'||g.type==='renju')renderIntersectionBoard(g,el,interactive);else if(g.type==='xiangqi')renderXiangqi(g,el,interactive);else if(g.type==='banqi')renderBanqi(g,el,interactive);else renderSquareBoard(g,el,interactive)}
function renderBanqi(g,el,interactive){el.className='board banqi-board';el.style.width='720px';el.style.height='360px';el.style.maxWidth='none';for(var i=0;i<32;i++){var b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';var cell=g.board[i],last=g.lastMove&&g.lastMove.to===i;b.className='banqi-cell'+(interactive&&selected===i?' selected':'')+(last?' last':'');if(cell){if(cell.up&&cell.p)b.appendChild(xqPiece(cell.p));else{var back=document.createElement('span');back.className='banqi-back';back.textContent=lang==='en'?'?':'暗';b.appendChild(back)}}if(interactive)bindPoint(b,i,4,8);el.appendChild(b)}}`,
'banqi renderer');

replaceExact(
`.sq{position:relative;border:0;padding:0;display:grid;place-items:center;aspect-ratio:1}`,
`.banqi-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(4,1fr);gap:5px;padding:8px;background:#8a5b35;border:5px solid #4a2f1d;border-radius:10px;box-sizing:border-box}.banqi-cell{position:relative;border:1px solid #684323;border-radius:8px;background:#d7ad72;padding:0;display:grid;place-items:center;min-width:0;min-height:0}.banqi-cell.selected{box-shadow:inset 0 0 0 4px #69afff}.banqi-cell.last{outline:3px solid #ffcf66;outline-offset:-4px}.banqi-cell .xq-piece{width:78%;height:78%;font-size:clamp(18px,5cqw,34px)}.banqi-back{width:78%;height:78%;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#8b3f2e,#4d211a 72%);border:2px solid #2b1510;color:#f5d69e;font-weight:900;font-size:clamp(18px,5cqw,34px);box-shadow:0 2px 5px rgba(0,0,0,.4)}.sq{position:relative;border:0;padding:0;display:grid;place-items:center;aspect-ratio:1}`,
'banqi styles');

replaceExact(
`function boardClick(index,rows,cols){var r=roomState,g=r&&r.gameState;if(!r||r.rawRole!=='player'||r.status!=='playing'||r.mySide!==g.turn)return;var row=Math.floor(index/cols),col=index%cols;if(g.type==='go'||g.type==='gomoku'||g.type==='renju'||g.type==='reversi'){send({type:'move',r:row,c:col});return}var p=g.board[index],mine=g.type==='chess'?(r.mySide==='W'?'w':'b'):(r.mySide==='R'?'r':'b');if(selected==null){if(p&&p[0]===mine){selected=index;renderBoard()}return}if(p&&p[0]===mine){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null}`,
`function boardClick(index,rows,cols){var r=roomState,g=r&&r.gameState;if(!r||r.rawRole!=='player'||r.status!=='playing'||r.mySide!==g.turn)return;var row=Math.floor(index/cols),col=index%cols;if(g.type==='go'||g.type==='gomoku'||g.type==='renju'||g.type==='reversi'){send({type:'move',r:row,c:col});return}if(g.type==='banqi'){var cell=g.board[index];if(cell&&!cell.up){selected=null;send({type:'move',action:'flip',from:index});return}var color=g.colors&&g.colors[r.mySide],mineBanqi=color==='R'?'r':color==='B'?'b':'';if(!mineBanqi)return;if(selected==null){if(cell&&cell.up&&cell.p&&cell.p[0]===mineBanqi){selected=index;renderBoard()}return}if(cell&&cell.up&&cell.p&&cell.p[0]===mineBanqi){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null;return}var p=g.board[index],mine=g.type==='chess'?(r.mySide==='W'?'w':'b'):(r.mySide==='R'?'r':'b');if(selected==null){if(p&&p[0]===mine){selected=index;renderBoard()}return}if(p&&p[0]===mine){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null}`,
'banqi click behavior');

replaceExact(
`function makePublicRoomRow(r){var row=document.createElement('div');row.className='room-row';var info=document.createElement('div');var a=document.createElement('strong');a.textContent=r.name+' · '+gameText(r.gameId,0);var b=document.createElement('div');b.className='small muted room-row-meta';b.textContent=r.id+' · '+statusText(r.status)+' · '+r.players+'/2'+(r.queueEnabled?' · '+t('queueCount')+' '+r.queueLength:'');info.appendChild(a);info.appendChild(b);var btn=document.createElement('button');btn.className='btn secondary';btn.type='button';btn.textContent=t('open');btn.addEventListener('click',function(){openRoomGate(r.id)});row.appendChild(info);row.appendChild(btn);return row}`,
`function roomDateText(ts){if(!Number(ts))return '—';try{return new Date(Number(ts)).toLocaleString(lang==='en'?'en-US':lang==='zh-Hans'?'zh-CN':'zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}catch(e){return '—'}}
function roomDurationText(ms){ms=Math.max(0,Number(ms)||0);var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')}
function roomTimingText(r){var created=lang==='en'?'Created':lang==='zh-Hans'?'创建':'建立',started=lang==='en'?'Started':lang==='zh-Hans'?'开始':'開始',duration=lang==='en'?'Duration':lang==='zh-Hans'?'时长':'時長',start=Number(r.startedAt)||0,end=Number(r.endedAt)||0,elapsed=start?roomDurationText((end||Date.now())-start):'—';return created+' '+roomDateText(r.createdAt)+' · '+started+' '+roomDateText(start)+' · '+duration+' '+elapsed}
function makePublicRoomRow(r){var row=document.createElement('div');row.className='room-row';var info=document.createElement('div');var a=document.createElement('strong');a.textContent=r.name+' · '+gameText(r.gameId,0);var b=document.createElement('div');b.className='small muted room-row-meta';b.textContent=r.id+' · '+statusText(r.status)+' · '+r.players+'/'+(r.capacity||2)+(r.queueEnabled?' · '+t('queueCount')+' '+r.queueLength:'');var c=document.createElement('div');c.className='small muted room-time-meta';c.textContent=roomTimingText(r);info.appendChild(a);info.appendChild(b);info.appendChild(c);var btn=document.createElement('button');btn.className='btn secondary';btn.type='button';btn.textContent=t('open');btn.addEventListener('click',function(){openRoomGate(r.id)});row.appendChild(info);row.appendChild(btn);return row}`,
'public room timings');

replaceExact(
`$('gameId').addEventListener('change',renderRuleFields);$('roomSearch').addEventListener('input',function(){renderPublicRooms(publicRoomsCache)});`,
`$('gameId').addEventListener('change',renderRuleFields);$('roomSearch').addEventListener('input',function(){renderPublicRooms(publicRoomsCache)});setInterval(function(){if(publicRoomsCache.length&&!$('lobby').classList.contains('hidden'))renderPublicRooms(publicRoomsCache)},1000);`,
'room duration ticker');

await writeFile(worker, source, "utf8");
