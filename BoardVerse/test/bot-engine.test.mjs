import assert from 'node:assert/strict';
import { BOT_LEVELS, BOT_GAMES, newBotGame, legalBotMoves, applyBotMove, chooseBotMove, gomokuWinner, botActionCandidates, orderBotActions } from '../src/bot/engine.js';
const ALL=['banqi','chess','go13','go19','go9','gomoku','qiguo','renju','reversi','xiangqi','xiangqi_random'];
assert.equal(BOT_LEVELS.length,5);
assert.deepEqual(Object.keys(BOT_GAMES).sort(),ALL);
let g=newBotGame('gomoku');assert.equal(legalBotMoves(g).length,225);for(const i of [0,15,1,16,2,17,3,18,4])applyBotMove(g,i);assert.equal(gomokuWinner(g.board),1);assert.equal(g.finished,true);
let r=newBotGame('reversi');assert.equal(legalBotMoves(r,1).length,4);let m=chooseBotMove(r,5,1);assert.ok(legalBotMoves(r,1).includes(m));applyBotMove(r,m);assert.equal(r.turn,2);
for(let level=1;level<=5;level++){let x=newBotGame('gomoku');let move=chooseBotMove(x,level,1);assert.ok(Number.isInteger(move)&&move>=0&&move<225)}
const go={type:'go',size:9,board:Array(81).fill(null),turn:'B'};assert.equal(botActionCandidates(go,{side:'B'}).length,82);
const chess={type:'chess',board:Array(64).fill(null),turn:'W'};chess.board[60]='wK';chess.board[4]='bK';assert.ok(botActionCandidates(chess,{side:'W'}).some(a=>a.from===60));
const xq={type:'xiangqi',board:Array(90).fill(null),turn:'R'};xq.board[85]='rK';assert.ok(botActionCandidates(xq,{side:'R'}).some(a=>a.from===85));
const ban={type:'banqi',board:Array(32).fill('rP'),covered:Array(32).fill(true),assigned:false,turnSeat:1};assert.equal(botActionCandidates(ban,{seat:1}).length,32);
const q={type:'qiguo',board:Array(361).fill(null),turn:'qin'};q.board[171]='qin:J';assert.ok(botActionCandidates(q,{country:'qin'}).length>20);
assert.equal(orderBotActions(chess,botActionCandidates(chess,{side:'W'}),5).length,botActionCandidates(chess,{side:'W'}).length);
console.log('bot-engine.test: PASS');
