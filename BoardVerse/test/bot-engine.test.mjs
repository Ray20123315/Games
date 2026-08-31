import assert from 'node:assert/strict';
import { BOT_LEVELS, BOT_GAMES, newBotGame, legalBotMoves, applyBotMove, chooseBotMove, gomokuWinner } from '../src/bot/engine.js';
assert.equal(BOT_LEVELS.length,5);
assert.deepEqual(Object.keys(BOT_GAMES).sort(),['gomoku','reversi']);
let g=newBotGame('gomoku');assert.equal(legalBotMoves(g).length,225);for(const i of [0,15,1,16,2,17,3,18,4])applyBotMove(g,i);assert.equal(gomokuWinner(g.board),1);assert.equal(g.finished,true);
let r=newBotGame('reversi');assert.equal(legalBotMoves(r,1).length,4);let m=chooseBotMove(r,5,1);assert.ok(legalBotMoves(r,1).includes(m));applyBotMove(r,m);assert.equal(r.turn,2);
for(let level=1;level<=5;level++){let x=newBotGame('gomoku');let move=chooseBotMove(x,level,1);assert.ok(Number.isInteger(move)&&move>=0&&move<225)}
console.log('bot-engine.test: PASS');
