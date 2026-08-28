import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "75b56214219c0703cd4a3540891ad8c2eef52d8a46b885e943cbe44f7608c203";
const expectedSha256 = "";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.19 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.19";', 'const APP_VERSION = "0.0.20";', "version");
replaceExact(
  'rotationPolicy: input.rotationPolicy === "rotate_both" ? "rotate_both" : "winner_stays",',
  'rotationPolicy: ["winner_stays", "rotate_both", "host_stays"].includes(input.rotationPolicy) ? input.rotationPolicy : "winner_stays",',
  "default rotation policy"
);
replaceExact(
  'if (["winner_stays", "rotate_both"].includes(msg.rotationPolicy)) room.settings.rotationPolicy = msg.rotationPolicy;',
  'if (["winner_stays", "rotate_both", "host_stays"].includes(msg.rotationPolicy)) room.settings.rotationPolicy = msg.rotationPolicy;',
  "queue settings rotation policy"
);
replaceExact(
`    const winner = result?.winner ? seated.find((m) => m?.side === result.winner) : null;
    const rotateBoth = room.settings.rotationPolicy === "rotate_both" || !winner;
    for (const member of seated) {
      if (!member) continue;
      if (rotateBoth || member.id !== winner.id) this.moveToSpectator(member);
    }`,
`    const winner = result?.winner ? seated.find((m) => m?.side === result.winner) : null;
    if (room.settings.rotationPolicy === "host_stays") {
      const host = seated.find((m) => m?.isOwner) || null;
      for (const member of seated) {
        if (!member) continue;
        if (!host || member.id !== host.id) this.moveToSpectator(member);
      }
    } else {
      const rotateBoth = room.settings.rotationPolicy === "rotate_both" || !winner;
      for (const member of seated) {
        if (!member) continue;
        if (rotateBoth || member.id !== winner.id) this.moveToSpectator(member);
      }
    }`,
  "host stays rotation"
);
replaceExact(
  '<select id="rotationCreate"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option></select>',
  '<select id="rotationCreate"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option><option value="host_stays" data-i18n="hostStays">房主留桌（對手輪替）</option></select>',
  "create rotation option"
);
replaceExact(
  '<select id="rotationRoom"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option></select>',
  '<select id="rotationRoom"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option><option value="host_stays" data-i18n="hostStays">房主留桌（對手輪替）</option></select>',
  "room rotation option"
);
replaceExact('rotation:"輪替方式",winnerStays:"勝者留桌",rotateBoth:"雙方輪替",ruleSettings:', 'rotation:"輪替方式",winnerStays:"勝者留桌",rotateBoth:"雙方輪替",hostStays:"房主留桌（對手輪替）",ruleSettings:', "traditional rotation i18n");
replaceExact('rotation:"轮换方式",winnerStays:"胜者留桌",rotateBoth:"双方轮换",ruleSettings:', 'rotation:"轮换方式",winnerStays:"胜者留桌",rotateBoth:"双方轮换",hostStays:"房主留桌（对手轮换）",ruleSettings:', "simplified rotation i18n");
replaceExact('rotation:"Rotation",winnerStays:"Winner stays",rotateBoth:"Rotate both",ruleSettings:', 'rotation:"Rotation",winnerStays:"Winner stays",rotateBoth:"Rotate both",hostStays:"Host stays (opponent rotates)",ruleSettings:', "english rotation i18n");
replaceExact(
  'rotation:{zhHant:["輪替方式","勝者留桌：有勝負時敗者轉觀眾、下一位補上；和棋雙方輪替。雙方輪替：每局結束兩位玩家都轉觀眾，再依排隊順序補位。"],zhHans:["轮换方式","胜者留桌：有胜负时败者转观众、下一位补上；和棋双方轮换。双方轮换：每局结束两位玩家都转观众，再按排队顺序补位。"],en:["Rotation","Winner stays: the loser becomes a spectator and the next queued member joins; draws rotate both. Rotate both: both players become spectators after every match."]}',
  'rotation:{zhHant:["輪替方式","勝者留桌：有勝負時敗者轉觀眾、下一位補上；和棋雙方輪替。雙方輪替：每局結束兩位玩家都轉觀眾，再依排隊順序補位。房主留桌（對手輪替）：房主在玩家席時固定留桌，不論勝敗或和棋都只讓對手轉觀眾，再由排隊第一位補上；若房主不在玩家席則雙方輪替。"],zhHans:["轮换方式","胜者留桌：有胜负时败者转观众、下一位补上；和棋双方轮换。双方轮换：每局结束两位玩家都转观众，再按排队顺序补位。房主留桌（对手轮换）：房主在玩家席时固定留桌，无论胜负或和棋都只让对手转观众，再由队首补位；若房主不在玩家席则双方轮换。"],en:["Rotation","Winner stays: the loser becomes a spectator and the next queued member joins; draws rotate both. Rotate both: both players become spectators after every match. Host stays: while the host occupies a player seat, only the opponent rotates after every match and the first queued member fills the seat; if the host is not seated, both players rotate."]}',
  "rotation help"
);
replaceExact(
  '.game-card{border:1px solid var(--line);border-radius:13px;background:#0d141e;padding:12px}.game-card strong{font-size:14px}.game-card p{font-size:12px;line-height:1.55;color:var(--muted);margin:5px 0 0}',
  '.game-card{position:relative;border:1px solid var(--line);border-radius:13px;background:#0d141e;padding:12px;padding-top:43px}.game-card strong{font-size:14px}.game-card p{font-size:12px;line-height:1.55;color:var(--muted);margin:5px 0 0}.game-rule-detail-btn{position:absolute;right:9px;top:8px;min-height:27px;padding:4px 8px;border:1px solid #8f7749;border-radius:8px;background:rgba(195,161,95,.1);color:var(--accent2);font-size:11px;font-weight:800}.rule-detail-root{display:grid;gap:14px}.rule-detail-intro{margin:0!important}.rule-detail-family{display:grid;gap:10px}.rule-detail-family>h4{margin:4px 0 0}.rule-detail-field{border:1px solid var(--line);border-radius:12px;padding:11px;background:var(--panel3)}.rule-detail-field-head{display:flex;align-items:center;gap:7px;margin-bottom:6px}.rule-detail-field-head strong{font-size:14px}.rule-detail-bang{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#806a3c,#c3a15f 55%,#e7d7a8);color:#211a0f;font-weight:900;font-size:11px}.rule-detail-field p{margin:5px 0!important}.rule-detail-meta{font-size:12px;color:var(--muted)}.rule-detail-options{display:grid;gap:7px;margin-top:8px}.rule-detail-option{padding:8px 9px;border-left:3px solid var(--accent);background:rgba(195,161,95,.07);border-radius:0 9px 9px 0}.rule-detail-option strong{display:block;font-size:12px}.rule-detail-option span{display:block;margin-top:3px;font-size:12px;line-height:1.5;color:var(--muted)}.rule-detail-extra{padding:9px 10px;border-radius:10px;background:rgba(195,161,95,.08);font-size:12px;line-height:1.55;color:var(--muted)}',
  "rule detail styles"
);

const optionDetailCode = `var RULE_OPTION_DETAIL_I18N={
  go:{
    ruleset:{
      chinese:["BoardVerse 預設：Area 面積計分、Komi 7.5、Simple Ko、禁止自殺著。之後仍可逐項修改。","BoardVerse 预设：Area 面积计分、Komi 7.5、Simple Ko、禁止自杀着。之后仍可逐项修改。","BoardVerse preset: area scoring, komi 7.5, simple ko, suicide off. Each setting remains editable."],
      japanese:["BoardVerse 預設：Territory 地計分、Komi 6.5、Simple Ko、禁止自殺著。此模式依目前盤面與提子數直接結算，不含終局死子協商。","BoardVerse 预设：Territory 地计分、Komi 6.5、Simple Ko、禁止自杀着；按当前盘面与提子数直接结算，不含终局死子协商。","BoardVerse preset: territory scoring, komi 6.5, simple ko, suicide off. Scoring uses the current board and captures without dead-stone negotiation."],
      aga:["BoardVerse 的 AGA 預設採 Area、Komi 7.5、Positional Superko、禁止自殺著；這裡描述的是本房間的 preset，不表示 AGA 規則只能用單一計數呈現。","BoardVerse 的 AGA 预设采用 Area、Komi 7.5、Positional Superko、禁止自杀着；这里描述的是本房间 preset。","BoardVerse's AGA preset uses area scoring, komi 7.5, positional superko and suicide off; this describes the app preset, not the only possible way to count under AGA rules."],
      newzealand:["BoardVerse 預設：Area、Komi 7、Positional Superko、允許自殺著；無氣己方棋串會依引擎規則移除。","BoardVerse 预设：Area、Komi 7、Positional Superko、允许自杀着；无气己方棋串会按引擎规则移除。","BoardVerse preset: area scoring, komi 7, positional superko and suicide on; no-liberty self-groups are removed by the engine."]
    },
    scoring:{area:["計算盤上活棋與其控制的空點；適合直接從終局盤面計數。","计算盘上活棋与其控制的空点。","Counts living stones on the board plus controlled empty points."],territory:["主要計算領地與提子；BoardVerse 目前沒有終局死子協商，因此以當下盤面及已提子數結算。","主要计算领地与提子；目前没有终局死子协商。","Counts territory plus captures. BoardVerse currently has no dead-stone negotiation, so it scores the current board and recorded captures."]},
    koRule:{simple:["只禁止下一手立刻把盤面還原成上一個盤面；隔一手後若其他規則允許可以再爭劫。","只禁止下一手立即恢复上一个盘面。","Only the immediate recreation of the previous board is illegal."],superko:["只要落子後盤面與本局任何曾出現盤面相同，就判為非法。","落子后若盘面与本局任何既往盘面相同即非法。","A move is illegal if it recreates any earlier board position from the game."]},
    mode:{standard:["雙方連續 Pass 後進入終局計分，以所選 scoring、Komi 等設定決定結果。","双方连续 Pass 后进入终局计分。","Two consecutive passes trigger final scoring with the selected scoring and komi settings."],capture:["不等終局數地；任一方先提到設定的吃子目標就立即獲勝。","不等终局计分；先达到吃子目标者立即获胜。","No final territory count: the first player to reach the configured capture target wins immediately."]}
  },
  gomoku:{
    variant:{freestyle:["同一直線形成五顆或更多己子即勝，長連也算勝。","同一直线形成五颗或更多即胜。","Five or more in a line wins; overlines also win."],exact5:["必須正好五連才勝；超過五顆的長連不算勝線。","必须正好五连才胜。","Exactly five in a row is required; an overline is not a winning line."],connect6:["目標改為六連；黑方第一手一子，之後每回合可連下兩子。","目标六连；黑方第一手一子，之后每回合两子。","Target six in a row; Black places one opening stone, then turns place two stones."]},
    boardSize:{"15":["15×15，較緊湊，也是五子棋常見競技尺寸。","15×15，较紧凑。","15×15, a compact and common competitive Gomoku size."],"19":["19×19，空間更大，仍使用相同勝線判定。","19×19，空间更大。","19×19 with the same line-win rules on a larger board."]},
    opening:{none:["不加入開局平衡限制。","不加入开局平衡限制。","No opening-balance restriction."],pro:["限制黑方早期落點以降低先手優勢。","限制黑方早期落点以降低先手优势。","Restricts early Black placements to reduce first-player advantage."],swap:["第一手後，原白方可選擇交換黑白持色。","第一手后原白方可选择交换持色。","After the first move, Player B may choose to swap colors."]}
  },
  renju:{opening:{free:["使用自由開局，但黑方長連、雙四、雙活三等禁手仍由伺服器判定。","使用自由开局，但黑方禁手仍由服务器判定。","Free opening; Black's overline, double-four and double-three restrictions remain server-enforced."]}},
  chess:{variant:{standard:["一般西洋棋，以將死、認輸及啟用的和棋條件判定。","标准国际象棋。","Standard chess with checkmate, resignation and enabled draw rules."],threecheck:["除一般將死外，先對敵王完成三次將軍也直接獲勝。","除将死外，先完成三次将军也获胜。","In addition to checkmate, delivering a third check wins immediately."],koth:["除一般將死外，王安全進入 d4、e4、d5、e5 任一中央格也獲勝。","王安全进入中央四格之一也获胜。","In addition to checkmate, safely moving the king onto d4, e4, d5 or e5 wins."]}},
  reversi:{
    boardSize:{"6":["6×6 快速盤，翻子與無棋可下時跳過規則不變。","6×6 快速盘。","6×6 fast board with the same flipping/pass rules."],"8":["8×8 標準尺寸。","8×8 标准尺寸。","Standard 8×8 board."],"10":["10×10 Grand，局面較長、可用空間更多。","10×10 Grand。","10×10 Grand for a longer game with more space."]},
    objective:{normal:["雙方都無合法著法後，盤面棋子較多者勝。","终局棋子较多者胜。","When neither side has a legal move, more discs wins."],misere:["反轉目標：終局時棋子較少者勝。","反转目标：终局棋子较少者胜。","Reverses the objective: fewer discs wins at the end."]}
  }
};
function ruleOptionDetail(family,key,value){var hit=RULE_OPTION_DETAIL_I18N[family]&&RULE_OPTION_DETAIL_I18N[family][key]&&RULE_OPTION_DETAIL_I18N[family][key][String(value)];return hit?hit[langIndex()]:''}
function ruleDetailUiText(key){var m={intro:["以下內容對應建立房間時真正可調整、且由伺服器執行的規則設定。","以下内容对应创建房间时真正可调整、且由服务器执行的规则设置。","These are the rule settings actually configurable when creating a room and enforced by the server."],details:["詳細了解規則設定","详细了解规则设置","Rule setting details"],default:["預設","默认","Default"],range:["範圍","范围","Range"],step:["步進","步进","Step"],onlyWhen:["僅在","仅在","Only when"],is:["為","为","is"],yes:["是／開啟","是／开启","Yes / On"],no:["否／關閉","否／关闭","No / Off"],yesDetail:["啟用這項規則；實際效果依上方說明。","启用这项规则；实际效果以上方说明为准。","Enables this rule; see the explanation above for its exact effect."],noDetail:["關閉這項規則；實際效果依上方說明。","关闭这项规则；实际效果以上方说明为准。","Disables this rule; see the explanation above for its exact effect."],extra:["補充","补充","Notes"]};return m[key][langIndex()]}
function appendRuleDetailFamily(root,gameId,family,title){var def=SERVER_RULES[family];if(!def)return;var sec=document.createElement('section');sec.className='rule-detail-family';var h=document.createElement('h4');h.textContent=title;sec.appendChild(h);(def.fields||[]).forEach(function(f){var box=document.createElement('div');box.className='rule-detail-field';var head=document.createElement('div');head.className='rule-detail-field-head';var name=document.createElement('strong');name.textContent=fieldTranslation(family,f.key,'label',f.label);var bang=document.createElement('span');bang.className='rule-detail-bang';bang.textContent='!';head.appendChild(name);head.appendChild(bang);box.appendChild(head);var help=document.createElement('p');help.textContent=helpTranslation(family,f.key,f.help);box.appendChild(help);var meta=[];var defaultValue=def.defaults?def.defaults[f.key]:undefined;if(defaultValue!==undefined)meta.push(ruleDetailUiText('default')+'：'+ruleValueText(family,f,defaultValue));if(f.type==='number'){meta.push(ruleDetailUiText('range')+'：'+f.min+'–'+f.max);meta.push(ruleDetailUiText('step')+'：'+(f.step||1))}if(f.when){var wk=Object.keys(f.when)[0],wf=(def.fields||[]).find(function(x){return x.key===wk});meta.push(ruleDetailUiText('onlyWhen')+' '+fieldTranslation(family,wk,'label',wf?wf.label:wk)+' '+ruleDetailUiText('is')+' '+ruleValueText(family,wf,f.when[wk]))}if(meta.length){var mm=document.createElement('div');mm.className='rule-detail-meta';mm.textContent=meta.join(' · ');box.appendChild(mm)}var opts=[];if(f.options)opts=f.options.map(function(o){return [o[0],optionTranslation(family,f.key,o[0],String(o[1])),ruleOptionDetail(family,f.key,o[0])]});else if(f.type==='checkbox')opts=[[true,ruleDetailUiText('yes'),ruleDetailUiText('yesDetail')],[false,ruleDetailUiText('no'),ruleDetailUiText('noDetail')]];if(opts.length){var list=document.createElement('div');list.className='rule-detail-options';opts.forEach(function(o){var item=document.createElement('div');item.className='rule-detail-option';var st=document.createElement('strong');st.textContent=o[1];var sp=document.createElement('span');sp.textContent=o[2]||helpTranslation(family,f.key,f.help);item.appendChild(st);item.appendChild(sp);list.appendChild(item)});box.appendChild(list)}sec.appendChild(box)});if(def.extraHelp){var ex=document.createElement('div');ex.className='rule-detail-extra';ex.textContent=ruleDetailUiText('extra')+'：'+def.extraHelp;sec.appendChild(ex)}root.appendChild(sec)}
function openGameRuleDetails(gameId){var root=document.createElement('div');root.className='rule-detail-root';var intro=document.createElement('p');intro.className='rule-detail-intro';intro.textContent=ruleDetailUiText('intro');root.appendChild(intro);if(gameId==='gomoku'){appendRuleDetailFamily(root,'gomoku','gomoku',lang==='en'?'Gomoku':lang==='zh-Hans'?'五子棋':'五子棋');appendRuleDetailFamily(root,'renju','renju',lang==='en'?'Renju':lang==='zh-Hans'?'连珠 Renju':'連珠 Renju')}else{var family=SERVER_GAMES[gameId]&&SERVER_GAMES[gameId].family;appendRuleDetailFamily(root,gameId,family,gameText(gameId,0))}openModal(ruleDetailUiText('details')+' · '+(gameId==='gomoku'?(lang==='en'?'Gomoku & Renju':lang==='zh-Hans'?'五子棋与连珠 Renju':'五子棋與連珠 Renju'):gameText(gameId,0)),'',{node:root,cancel:false,confirmText:t('confirm')})}
`;
replaceExact('var RULE_HELP_I18N={', optionDetailCode + 'var RULE_HELP_I18N={', "option detail localization");
replaceExact(
  "function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);if(id==='renju')return;var c=document.createElement('article');c.className='game-card';var st=document.createElement('strong');st.textContent=id==='gomoku'?(lang==='en'?'Gomoku & Renju':lang==='zh-Hans'?'五子棋与连珠 Renju':'五子棋與連珠 Renju'):gameText(id,0);var p=document.createElement('p');p.textContent=id==='gomoku'?(gameText('gomoku',1)+' · '+gameText('renju',1)):gameText(id,1);c.appendChild(st);c.appendChild(p);$('gameList').appendChild(c)});sel.appendChild(fiveGroup);if(current&&SERVER_GAMES[current])sel.value=current;renderRuleFields()}",
  "function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);if(id==='renju')return;var c=document.createElement('article');c.className='game-card';var detail=document.createElement('button');detail.type='button';detail.className='game-rule-detail-btn';detail.textContent=ruleDetailUiText('details');detail.addEventListener('click',function(){openGameRuleDetails(id)});var st=document.createElement('strong');st.textContent=id==='gomoku'?(lang==='en'?'Gomoku & Renju':lang==='zh-Hans'?'五子棋与连珠 Renju':'五子棋與連珠 Renju'):gameText(id,0);var p=document.createElement('p');p.textContent=id==='gomoku'?(gameText('gomoku',1)+' · '+gameText('renju',1)):gameText(id,1);c.appendChild(detail);c.appendChild(st);c.appendChild(p);$('gameList').appendChild(c)});sel.appendChild(fiveGroup);if(current&&SERVER_GAMES[current])sel.value=current;renderRuleFields()}",
  "game catalog rule details"
);

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (expectedSha256 && actualSha256 !== expectedSha256) throw new Error(`v0.0.20 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.20 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
