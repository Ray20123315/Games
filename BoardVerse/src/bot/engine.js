export const BOT_LEVELS = Object.freeze([
  { id:1, name:"入門", en:"Beginner" },
  { id:2, name:"簡單", en:"Easy" },
  { id:3, name:"普通", en:"Normal" },
  { id:4, name:"困難", en:"Hard" },
  { id:5, name:"專家", en:"Expert" },
]);
export const BOT_GAMES = Object.freeze({
  gomoku:{ id:"gomoku", title:"五子棋 Gomoku", size:15 },
  reversi:{ id:"reversi", title:"黑白棋 Reversi", size:8 },
});
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
function lineScore(board,idx,p,size=15){const r=Math.floor(idx/size),c=idx%size,o=p===1?2:1;let s=0;for(const[dr,dc]of dirs){let own=1,block=0;for(const sign of[-1,1]){let rr=r+dr*sign,cc=c+dc*sign,k=0;while(inside(size,rr,cc)&&board[rr*size+cc]===p){own++;k++;rr+=dr*sign;cc+=dc*sign}if(inside(size,rr,cc)&&board[rr*size+cc]===o)block++}s+=own>=5?1e7:own===4?300000/(1+block):own===3?9000/(1+block):own===2?450:40}return s}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
export function chooseBotMove(state,level=3,p=state.turn){const moves=legalBotMoves(state,p);if(!moves.length)return null;level=Math.max(1,Math.min(5,Number(level)||1));if(level===1)return pick(moves);if(state.gameId==="reversi"){const corners=new Set([0,7,56,63]);const score=i=>{const flips=revFlips(state.board,i,p).length;let s=flips*12+(corners.has(i)?1000:0);if([9,14,49,54].includes(i))s-=120;return s};if(level===2&&Math.random()<.55)return pick(moves);return moves.slice().sort((a,b)=>score(b)-score(a))[0]}
 const o=p===1?2:1;for(const i of moves){const b=state.board.slice();b[i]=p;if(gomokuWinner(b,15)===p)return i}for(const i of moves){const b=state.board.slice();b[i]=o;if(gomokuWinner(b,15)===o)return i}if(level===2&&Math.random()<.55)return pick(moves);let ranked=moves.map(i=>({i,s:lineScore(state.board,i,p)+lineScore(state.board,i,o)*(level>=4?.92:.62)}));if(level>=4){const center=7*15+7;ranked.forEach(x=>{const r=Math.floor(x.i/15),c=x.i%15;x.s+=150-Math.hypot(r-7,c-7)*9;if(level===5){const b=state.board.slice();b[x.i]=p;const next=b.map((v,i)=>v?null:i).filter(v=>v!==null).slice(0,80);let best=0;for(const j of next)best=Math.max(best,lineScore(b,j,p));x.s+=best*.18}})}ranked.sort((a,b)=>b.s-a.s);const top=ranked.slice(0,level===3?4:level===4?2:1);return pick(top).i}
