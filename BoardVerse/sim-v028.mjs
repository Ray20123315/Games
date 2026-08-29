import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
const inputHash = createHash("sha256").update(source).digest("hex");
const expectedInputHash = "368863fec9b5abd195b5d0687c8645a962ca300fe74bad3f2791d343ae7209c2";
if (inputHash !== expectedInputHash) throw new Error(`v0.0.28 source hash mismatch: ${inputHash}`);

function replaceExact(from,to,label){
  const i=source.indexOf(from); if(i<0) throw new Error(label+" marker not found");
  if(source.indexOf(from,i+from.length)>=0) throw new Error(label+" marker not unique");
  source=source.replace(from,to);
}
function blockRange(marker,label){
  const start=source.indexOf(marker); if(start<0) throw new Error(label+" marker not found");
  if(source.indexOf(marker,start+marker.length)>=0) throw new Error(label+" marker not unique");
  const open=source.indexOf("{",start); if(open<0) throw new Error(label+" opening brace not found");
  let depth=0,q="",esc=false,line=false,com=false;
  for(let i=open;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n')line=false;continue}
    if(com){if(c==='*'&&n==='/'){com=false;i++}continue}
    if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}
    if(c==='/'&&n==='/'){line=true;i++;continue}
    if(c==='/'&&n==='*'){com=true;i++;continue}
    if(c==='"'||c==="'"||c==='`'){q=c;continue}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return[start,i+1];
  }
  throw new Error(label+" closing brace not found");
}
function replaceBlock(marker,replacement,label){const [a,b]=blockRange(marker,label);source=source.slice(0,a)+replacement+source.slice(b)}

replaceExact('const APP_VERSION = "0.0.27";','const APP_VERSION = "0.0.28";','version');
replaceExact('.rule-detail-list{display:grid;gap:10px}', '.rule-detail-list{display:grid;gap:10px}.rule-detail-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--panel2);position:sticky;top:0;z-index:2}.rule-detail-tab{min-width:0;border:1px solid transparent;border-radius:9px;padding:8px 7px;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.rule-detail-tab:hover{color:var(--text);border-color:var(--line)}.rule-detail-tab[aria-selected="true"]{background:var(--gold-gradient);color:#1b160d;border-color:#a98546;box-shadow:0 2px 8px rgba(0,0,0,.18)}.rule-detail-tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.rule-detail-panels{min-height:150px}.rule-detail-panel{display:grid;gap:10px}.rule-detail-panel[hidden]{display:none}.rule-detail-empty{margin:0;color:var(--muted);line-height:1.65}', 'rule detail tab css');

const tabbedDetail = `function buildRuleDetailNode(gameId){
  var wrap=document.createElement('div');wrap.className='rule-detail-list';
  var game=SERVER_GAMES[gameId],family=game&&game.family,def=family&&SERVER_RULES[family];
  var tabs=document.createElement('div');tabs.className='rule-detail-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',lang==='en'?'Game details':lang==='zh-Hans'?'游戏详情':'遊戲詳情');
  var panels=document.createElement('div');panels.className='rule-detail-panels';
  var labels=[lang==='en'?'How to play':lang==='zh-Hans'?'游戏方式':'遊戲方式',lang==='en'?'Rule settings':lang==='zh-Hans'?'规则设置':'規則設定',lang==='en'?'Additional rules':lang==='zh-Hans'?'补充规则':'補充規則'];
  var keys=['play','settings','extra'],tabButtons=[],panelNodes=[],safe=String(gameId||'game').replace(/[^a-z0-9_-]/gi,'');
  keys.forEach(function(key,i){
    var tab=document.createElement('button');tab.type='button';tab.className='rule-detail-tab';tab.setAttribute('role','tab');tab.id='rule-detail-tab-'+safe+'-'+key;tab.setAttribute('aria-controls','rule-detail-panel-'+safe+'-'+key);tab.setAttribute('aria-selected',i===0?'true':'false');tab.tabIndex=i===0?0:-1;tab.textContent=labels[i];tabs.appendChild(tab);tabButtons.push(tab);
    var panel=document.createElement('section');panel.className='rule-detail-panel';panel.id='rule-detail-panel-'+safe+'-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.hidden=i!==0;panels.appendChild(panel);panelNodes.push(panel);
  });
  function activateRuleDetailTab(index,focus){
    tabButtons.forEach(function(tab,i){var on=i===index;tab.setAttribute('aria-selected',on?'true':'false');tab.tabIndex=on?0:-1;panelNodes[i].hidden=!on});
    if(focus)tabButtons[index].focus();
  }
  tabButtons.forEach(function(tab,i){
    tab.addEventListener('click',function(){activateRuleDetailTab(i,false)});
    tab.addEventListener('keydown',function(e){var next=i;if(e.key==='ArrowRight')next=(i+1)%tabButtons.length;else if(e.key==='ArrowLeft')next=(i+tabButtons.length-1)%tabButtons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabButtons.length-1;else return;e.preventDefault();activateRuleDetailTab(next,true)});
  });
  var play=document.createElement('p');play.className='rule-detail-item';play.textContent=gameplayGuide(gameId);panelNodes[0].appendChild(play);
  if(!def||!def.fields||!def.fields.length){
    var empty=document.createElement('p');empty.className='rule-detail-empty';empty.textContent=lang==='en'?'This game has no configurable rule fields.':lang==='zh-Hans'?'这个棋类没有可调整的规则字段。':'這個棋類沒有可調整的規則欄位。';panelNodes[1].appendChild(empty);
  }else def.fields.forEach(function(f){
    var item=document.createElement('section');item.className='rule-detail-item';var title=document.createElement('strong');title.textContent=fieldTranslation(family,f.key,'label',f.label)+' !';item.appendChild(title);
    var help=document.createElement('p');help.textContent=helpTranslation(family,f.key,f.help)||'';item.appendChild(help);
    if(f.options&&f.options.length){var ul=document.createElement('ul');ul.className='rule-detail-options';f.options.forEach(function(o){var li=document.createElement('li');var label=optionTranslation(family,f.key,o[0],String(o[1]));var extra=family==='go'?goOptionDetail(f.key,o[0]):'';li.textContent=label+(extra?' — '+extra:'');ul.appendChild(li)});item.appendChild(ul)}
    else if(f.type==='checkbox'){var vals=document.createElement('p');vals.className='small muted';vals.textContent=lang==='en'?'Choices: Yes / No':lang==='zh-Hans'?'选项：是 / 否':'選項：是 / 否';item.appendChild(vals)}
    else if(f.type==='number'){var range=document.createElement('p');range.className='small muted';var d=def.defaults&&def.defaults[f.key];range.textContent=(lang==='en'?'Default ':'預設 ')+String(d)+(f.min!=null&&f.max!=null?' · '+(lang==='en'?'Range ':'範圍 ')+f.min+'–'+f.max:'');item.appendChild(range)}
    panelNodes[1].appendChild(item);
  });
  var extra=document.createElement('p');extra.className=def&&def.extraHelp?'rule-detail-item':'rule-detail-empty';extra.textContent=def&&def.extraHelp?def.extraHelp:(lang==='en'?'There are no additional rules for this game.':lang==='zh-Hans'?'这个棋类目前没有额外补充规则。':'這個棋類目前沒有額外補充規則。');panelNodes[2].appendChild(extra);
  wrap.appendChild(tabs);wrap.appendChild(panels);return wrap;
}`;
replaceBlock('function buildRuleDetailNode(gameId){',tabbedDetail,'tabbed rule detail modal');

const output=Buffer.from(source,'utf8');
await writeFile(worker,output);
const hash=createHash('sha256').update(output).digest('hex');
console.log('V028_BYTES='+output.length);
console.log('V028_SHA256='+hash);
