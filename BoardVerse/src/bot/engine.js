import { GAME_IDS } from "../core/config.js";

export const BOT_LEVELS = Object.freeze([
  { id:1, name:"入門", en:"Beginner" },
  { id:2, name:"簡單", en:"Easy" },
  { id:3, name:"普通", en:"Normal" },
  { id:4, name:"困難", en:"Hard" },
  { id:5, name:"專家", en:"Expert" },
]);

const GAMES = {
  go9:{id:"go9",title:"圍棋 9×9",short:"快速圍棋",description:"9×9 小棋盤，適合快速單人對局。",kind:"point",size:9},
  go13:{id:"go13",title:"圍棋 13×13",short:"中型圍棋",description:"13×13，在速度與布局深度之間取得平衡。",kind:"point",size:13},
  go19:{id:"go19",title:"圍棋 19×19",short:"標準圍棋",description:"19×19 標準棋盤；可 Pass，規則沿用 BoardVerse canonical engine。",kind:"point",size:19},
  gomoku:{id:"gomoku",title:"五子棋",short:"自由五子棋",description:"15×15，先形成五連者勝。",kind:"point",size:15},
  renju:{id:"renju",title:"連珠 Renju",short:"黑方有禁手",description:"15×15，黑方禁手與勝負判定由 canonical engine 執行。",kind:"point",size:15},
  xiangqi:{id:"xiangqi",title:"象棋",short:"中國象棋",description:"標準 9×10 中國象棋。",kind:"move",rows:10,cols:9},
  xiangqi_random:{id:"xiangqi_random",title:"象棋・隨機布局",short:"合法底線洗牌",description:"底線合法隨機布局，走法沿用象棋規則。",kind:"move",rows:10,cols:9},
  banqi:{id:"banqi",title:"暗棋（翻棋）",short:"4×8 翻棋",description:"32 子蓋牌；第一顆翻出的顏色決定你的陣營。",kind:"banqi",rows:4,cols:8},
  qiguo:{id:"qiguo",title:"七國象棋",short:"19×19 · 單人七國",description:"你控制秦國；其餘六國由電腦依序控制。",kind:"move",rows:19,cols:19},
  chess:{id:"chess",title:"西洋棋",short:"標準西洋棋",description:"標準 8×8 西洋棋，升變預設為皇后。",kind:"move",rows:8,cols:8},
  reversi:{id:"reversi",title:"黑白棋 Reversi",short:"翻轉棋",description:"8×8，無棋可下會自動跳過。",kind:"point",size:8},
};
export const BOT_GAMES = Object.freeze(Object.fromEntries(GAME_IDS.map(id=>[id,Object.freeze(GAMES[id])])));

const dirs=[[1,0],[0,1],[1,1],[1,-1]];
const inside=(n,r,c)=>r>=0&&c>=0&&r<n&&c<n;
export function newBotGame(gameId="gomoku") {
  if(gameId==="reversi") { const b=Array(64).fill(0); b[27]=2;b[28]=1;b[35]=1;b[36]=2;return{gameId,board:b,turn:1,winner:0,finished:false}; }
  return{gameId:"gomoku",board:Array(225).fill(0),turn:1,winner:0,finished:false};
}
export function gomokuWinner(board,size=15){for(let r=0;r<size;r++)for(let c=0;c<size;c++){const p=board[r*size+c];if(!p)continue;for(const[dR,dC]of dirs){let k=1;while(k<5&&inside(size,r+dR*k,c+dC*k)&&board[(r+dR*k)*size+c+dC*k]===p)k++;if(k>=5)return p}}return board.every(Boolean)?3:0}
function revFlips(board,idx,p){if(board[idx])return[];const n=8,r=Math.floor(idx/n),c=idx%n,o=p===1?2:1,out=[];for(const[dr,dc]of dirs.concat([[1,-1],[-1,1],[-1,-1],[-1,0],[0,-1]])){let rr=r+dr,cc=c+dc,tmp=[];while(inside(n,rr,cc)&&board[rr*n+cc]===o){tmp.push(rr*n+cc);rr+=dr;cc+=dc}if(tmp.length&&inside(n,rr,cc)&&board[rr*n+cc]===p)out.push(...tmp)}return out}
export function legalBotMoves(state,p=state.turn){if(state.gameId==="reversi"){const out=[];for(let i=0;i<64;i++)if(revFlips(state.board,i,p).length)out.push(i);return out}return state.board.map((v,i)=>v?null:i).filter(v=>v!==null)}
export function applyBotMove(state,idx){if(state.finished)throw Error("game finished");const p=state.turn;if(state.gameId==="reversi"){const f=revFlips(state.board,idx,p);if(!f.length)throw Error("illegal move");state.board[idx]=p;for(const x of f)state.board[x]=p;const o=p===1?2:1,om=legalBotMoves(state,o),pm=legalBotMoves(state,p);if(om.length)state.turn=o;else if(pm.length)state.turn=p;else{state.finished=true;const a=state.board.filter(x=>x===1).length,b=state.board.filter(x=>x===2).length;state.winner=a===b?3:a>b?1:2}return state}
  if(state.board[idx])throw Error("illegal move");state.board[idx]=p;const w=gomokuWinner(state.board,15);if(w){state.finished=true;state.winner=w}else state.turn=p===1?2:1;return state}
function lineScore(board,idx,p,size=15){const r=Math.floor(idx/size),c=idx%size,o=p===1?2:1;let s=0;for(const[dr,dc]of dirs){let own=1,block=0;for(const sign of[-1,1]){let rr=r+dr*sign,cc=c+dc*sign;while(inside(size,rr,cc)&&board[rr*size+cc]===p){own++;rr+=dr*sign;cc+=dc*sign}if(inside(size,rr,cc)&&board[rr*size+cc]===o)block++}s+=own>=5?1e7:own===4?300000/(1+block):own===3?9000/(1+block):own===2?450:40}return s}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
export function chooseBotMove(state,level=3,p=state.turn){const moves=legalBotMoves(state,p);if(!moves.length)return null;level=Math.max(1,Math.min(5,Number(level)||1));if(level===1)return pick(moves);if(state.gameId==="reversi"){const corners=new Set([0,7,56,63]);const score=i=>{const flips=revFlips(state.board,i,p).length;let s=flips*12+(corners.has(i)?1000:0);if([9,14,49,54].includes(i))s-=120;return s};if(level===2&&Math.random()<.55)return pick(moves);return moves.slice().sort((a,b)=>score(b)-score(a))[0]}
 const o=p===1?2:1;for(const i of moves){const b=state.board.slice();b[i]=p;if(gomokuWinner(b,15)===p)return i}for(const i of moves){const b=state.board.slice();b[i]=o;if(gomokuWinner(b,15)===o)return i}if(level===2&&Math.random()<.55)return pick(moves);let ranked=moves.map(i=>({i,s:lineScore(state.board,i,p)+lineScore(state.board,i,o)*(level>=4?.92:.62)}));if(level>=4)ranked.forEach(x=>{const r=Math.floor(x.i/15),c=x.i%15;x.s+=150-Math.hypot(r-7,c-7)*9;if(level===5){const b=state.board.slice();b[x.i]=p;const next=b.map((v,i)=>v?null:i).filter(v=>v!==null).slice(0,80);let best=0;for(const j of next)best=Math.max(best,lineScore(b,j,p));x.s+=best*.18}});ranked.sort((a,b)=>b.s-a.s);const top=ranked.slice(0,level===3?4:level===4?2:1);return pick(top).i}

function pushRay(out,from,r,c,dr,dc,rows,cols,max=99){for(let k=1;k<=max;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||cc<0||rr>=rows||cc>=cols)break;out.push({from,to:rr*cols+cc})}}
function pointActions(game){const n=game.size||Math.round(Math.sqrt(game.board.length));const out=[];for(let i=0;i<game.board.length;i++)if(!game.board[i])out.push({r:Math.floor(i/n),c:i%n});if(game.type==="go")out.push({action:"pass"});return out}
function chessActions(game,side){const color=side==="W"?"w":"b",out=[];for(let from=0;from<64;from++){const p=game.board[from];if(!p||p[0]!==color)continue;for(let to=0;to<64;to++)if(to!==from&&game.board[to]?.[0]!==color)out.push({from,to,promotion:"Q"})}return out}
function xiangqiActions(game,side){const color=side==="R"?"r":"b",out=[];for(let from=0;from<90;from++){const p=game.board[from];if(!p||p[0]!==color)continue;for(let to=0;to<90;to++)if(to!==from&&game.board[to]?.[0]!==color)out.push({from,to})}return out}
function banqiActions(game,side,seat=1){const out=[];for(let i=0;i<32;i++)if(game.board[i]&&game.covered?.[i])out.push({r:Math.floor(i/8),c:i%8,seat});if(game.assigned&&side){for(let from=0;from<32;from++){const p=game.board[from];if(!p||game.covered?.[from])continue;for(let to=0;to<32;to++)if(to!==from)out.push({from,to,seat})}}return out}
function qiguoActions(game,country){const out=[];for(let from=0;from<361;from++){const raw=game.board[from];if(!raw||!String(raw).startsWith(country+":"))continue;const type=String(raw).split(":")[1]||"",r=Math.floor(from/19),c=from%19;if(type==="J"||type==="M"){for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])pushRay(out,from,r,c,dr,dc,19,19)}else if(type==="P"||type==="C"){for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]])pushRay(out,from,r,c,dr,dc,19,19)}else if(type==="B"){for(const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]])pushRay(out,from,r,c,dr,dc,19,19)}else if(type==="G"||type==="N"){const k=type==="G"?4:5;for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const rr=r+dr*k,cc=c+dc*k;if(inside(19,rr,cc))out.push({from,to:rr*19+cc})}}else if(type==="D"){for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){const rr=r+dr,cc=c+dc;if(inside(19,rr,cc))out.push({from,to:rr*19+cc})}}else if(type==="S"){for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+dr,cc=c+dc;if(inside(19,rr,cc))out.push({from,to:rr*19+cc})}}else if(type==="H"){for(const[dr,dc]of[[4,3],[4,-3],[-4,3],[-4,-3],[3,4],[3,-4],[-3,4],[-3,-4]]){const rr=r+dr,cc=c+dc;if(inside(19,rr,cc))out.push({from,to:rr*19+cc})}}}return out}
export function botActionCandidates(game, actor={}){
  if(!game||game.ended)return[];
  if(["go","gomoku","renju","reversi"].includes(game.type))return pointActions(game);
  if(game.type==="chess")return chessActions(game,actor.side||game.turn);
  if(game.type==="xiangqi")return xiangqiActions(game,actor.side||game.turn);
  if(game.type==="banqi")return banqiActions(game,actor.side,actor.seat??1);
  if(game.type==="qiguo")return qiguoActions(game,actor.country||game.turn);
  return[];
}
const PIECE_VALUE={P:10,N:30,B:32,R:50,Q:90,K:1000,H:38,C:48,E:20,A:20,G:45,D:20,S:12,J:110,M:2};
function targetValue(game,a){if(a?.to==null)return 0;const p=game.board?.[a.to];if(!p||p==="?")return 0;const t=String(p).includes(":")?String(p).split(":")[1]:String(p).slice(-1);return PIECE_VALUE[t]||10}
function centerScore(game,a){if(a?.r!=null){const n=game.size||8;return 20-Math.hypot(a.r-(n-1)/2,a.c-(n-1)/2)}if(a?.to!=null){const cols=game.type==="xiangqi"?9:game.type==="qiguo"?19:game.type==="banqi"?8:8,rows=game.type==="xiangqi"?10:game.type==="qiguo"?19:game.type==="banqi"?4:8,r=Math.floor(a.to/cols),c=a.to%cols;return 12-Math.hypot(r-(rows-1)/2,c-(cols-1)/2)}return 0}
export function orderBotActions(game,actions,level=3){level=Math.max(1,Math.min(5,Number(level)||1));const arr=actions.map(a=>({a,s:targetValue(game,a)*30+centerScore(game,a)}));if(level===1)return arr.sort(()=>Math.random()-.5).map(x=>x.a);const noise=level===2?900:level===3?180:level===4?45:0;return arr.map(x=>({a:x.a,s:x.s+Math.random()*noise})).sort((x,y)=>y.s-x.s).map(x=>x.a)}
