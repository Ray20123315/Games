function inside(size,r,c){return r>=0&&c>=0&&r<size&&c<size}
function idx(size,r,c){return r*size+c}
const ADJ=[[1,0],[-1,0],[0,1],[0,-1]];

function settledEmptyPoints(game,side){
  const size=Number(game?.size)||Math.round(Math.sqrt(game?.board?.length||0));
  const board=Array.isArray(game?.board)?game.board:[];
  const settled=new Set(),seen=new Set();
  for(let i=0;i<board.length;i++){
    if(board[i]||seen.has(i))continue;
    const region=[],borders=new Set(),stack=[i];seen.add(i);
    while(stack.length){
      const p=stack.pop(),r=Math.floor(p/size),c=p%size;region.push(p);
      for(const[dr,dc]of ADJ){
        const rr=r+dr,cc=c+dc;if(!inside(size,rr,cc))continue;
        const q=idx(size,rr,cc),v=board[q];
        if(!v&&!seen.has(q)){seen.add(q);stack.push(q)} else if(v==='B'||v==='W')borders.add(v);
      }
    }
    if(borders.size===1)for(const p of region)settled.add(p);
  }
  return settled;
}

function pointIndex(game,a){
  if(a?.r==null||a?.c==null)return -1;
  const size=Number(game?.size)||Math.round(Math.sqrt(game?.board?.length||0));
  return idx(size,Number(a.r),Number(a.c));
}

function pointScore(game,actor,a,level){
  const size=Number(game?.size)||Math.round(Math.sqrt(game?.board?.length||0));
  const board=game.board||[],side=actor?.side||game.turn,opp=side==='B'?'W':'B';
  const r=Number(a.r),c=Number(a.c);let enemy=0,own=0,empty=0;
  for(const[dr,dc]of ADJ){const rr=r+dr,cc=c+dc;if(!inside(size,rr,cc))continue;const v=board[idx(size,rr,cc)];if(v===opp)enemy++;else if(v===side)own++;else empty++}
  const center=(size-1)/2,central=20-Math.hypot(r-center,c-center);
  return enemy*90+empty*16-own*3+central+(Math.max(1,Math.min(5,Number(level)||3))-3)*enemy*8;
}

export function orderGoBotActions(game,actor={},actions=[],level=3){
  const list=Array.isArray(actions)?actions.slice():[];
  if(game?.type!=='go'||game?.rules?.mode==='capture')return list;
  const pass=list.find(a=>a?.action==='pass')||{action:'pass'};
  const points=list.filter(a=>a?.r!=null&&a?.c!=null);
  if(Number(game.consecutivePasses||0)>=1)return[pass,...points];
  const settled=settledEmptyPoints(game,actor?.side||game.turn);
  const meaningful=points.filter(a=>!settled.has(pointIndex(game,a))).sort((a,b)=>pointScore(game,actor,b,level)-pointScore(game,actor,a,level));
  const filler=points.filter(a=>settled.has(pointIndex(game,a)));
  const moveNumber=Number(game.moveNumber||0),area=Math.max(1,Number(game.size||0)**2||game.board?.length||1);
  if(!meaningful.length&&moveNumber>=Math.max(8,Math.floor(area*.22)))return[pass,...filler];
  if(moveNumber>=Math.floor(area*.68)&&meaningful.length<=Math.max(1,Math.floor(area*.02)))return[pass,...meaningful,...filler];
  return[...meaningful,pass,...filler];
}
