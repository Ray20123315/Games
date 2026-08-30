import { normalizeClockConfig } from "../clock/clock-engine.js";

export const ROOM_GAME_DEFS = Object.freeze({
  go9:{family:"go",title:"圍棋 9×9"}, go13:{family:"go",title:"圍棋 13×13"}, go19:{family:"go",title:"圍棋 19×19"},
  gomoku:{family:"gomoku",title:"五子棋"}, renju:{family:"renju",title:"連珠 Renju"},
  xiangqi:{family:"xiangqi",title:"象棋"}, xiangqi_random:{family:"xiangqi",title:"象棋・隨機布局"}, banqi:{family:"banqi",title:"暗棋（翻棋）"},
  chess:{family:"chess",title:"西洋棋"}, reversi:{family:"reversi",title:"黑白棋 Reversi"}, qiguo:{family:"qiguo",title:"七國象棋"},
});

export const ROOM_RULE_DEFS = Object.freeze({
  go:{
    defaults:{ruleset:"chinese",scoring:"area",komi:7.5,koRule:"simple",suicide:false,mode:"standard",captureGoal:1,handicap:0,sideMode:"guess"},
    fields:[
      {key:"ruleset",label:"規則集",type:"select",options:[["chinese","中國規則"],["japanese","日本規則"],["aga","AGA 規則"],["newzealand","紐西蘭規則"]]},
      {key:"scoring",label:"終局計分",type:"select",options:[["area","Area 面積計分"],["territory","Territory 地計分"]]},
      {key:"komi",label:"貼目 Komi",type:"number",min:0,max:20,step:0.5},
      {key:"koRule",label:"劫規則",type:"select",options:[["simple","Simple Ko 簡單劫"],["superko","Positional Superko 盤面超劫"]]},
      {key:"suicide",label:"允許自殺著",type:"checkbox"},
      {key:"mode",label:"對局模式",type:"select",options:[["standard","標準圍棋"],["capture","Capture Go 吃子棋"]]},
      {key:"captureGoal",label:"吃子棋目標",type:"number",min:1,max:20,step:1,when:{mode:"capture"}},
      {key:"handicap",label:"讓子",type:"number",min:0,max:9,step:1},
      {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]]},
    ],
  },
  gomoku:{defaults:{variant:"freestyle",boardSize:15,opening:"none",sideMode:"guess"},fields:[
    {key:"variant",label:"勝利規則",type:"select",options:[["freestyle","Freestyle 五子以上"],["exact5","Exact-Five 精確五連"],["connect6","Connect6 六子棋"]]},
    {key:"boardSize",label:"棋盤大小",type:"select",options:[[15,"15×15"],[19,"19×19"]]},
    {key:"opening",label:"開局平衡",type:"select",options:[["none","無限制"],["pro","Pro 開局"],["swap","Swap 交換持色"]]},
    {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]]},
  ]},
  renju:{defaults:{opening:"free",sideMode:"guess"},fields:[
    {key:"opening",label:"開局規則",type:"select",options:[["free","自由開局"]]},
    {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]]},
  ]},
  xiangqi:{defaults:{stalemateLoss:true,sideMode:"random"},fields:[
    {key:"stalemateLoss",label:"困斃判負",type:"checkbox"},
    {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["random","隨機抽籤"],["manual","玩家協議"]]},
  ]},
  chess:{defaults:{variant:"standard",threefold:true,fiftyMove:true,insufficient:true,sideMode:"hidden"},fields:[
    {key:"variant",label:"對局變種",type:"select",options:[["standard","標準西洋棋"],["threecheck","Three-Check 三將棋"],["koth","King of the Hill 王者登峰"]]},
    {key:"threefold",label:"三次重複可和棋",type:"checkbox"},{key:"fiftyMove",label:"50-move Rule",type:"checkbox"},{key:"insufficient",label:"子力不足自動和棋",type:"checkbox"},
    {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["hidden","雙手藏棋"],["random","隨機抽籤"],["manual","玩家協議"]]},
  ]},
  reversi:{defaults:{boardSize:8,objective:"normal",sideMode:"random"},fields:[
    {key:"boardSize",label:"棋盤大小",type:"select",options:[[6,"6×6"],[8,"8×8 標準"],[10,"10×10 Grand"]]},
    {key:"objective",label:"勝利條件",type:"select",options:[["normal","標準：棋子多者勝"],["misere","Anti-Othello：棋子少者勝"]]},
    {key:"sideMode",label:"猜先／分色方式",type:"select",options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]]},
  ]},
  qiguo:{defaults:{playerCount:7,drawMode:"country"},fields:[
    {key:"playerCount",label:"對局人數",type:"select",options:[[3,"3 人"],[4,"4 人"],[5,"5 人"],[6,"6 人"],[7,"7 人"]]},
    {key:"drawMode",label:"抽籤方式",type:"select",options:[["country","抽國家／聯盟（國序固定）"],["number","抽 1～N 號後依序選國"]]},
  ]},
  banqi:{defaults:{},fields:[]},
});

function option(def,key,value,fallback){const f=def.fields.find((x)=>x.key===key),allowed=(f?.options||[]).map((x)=>x[0]);return allowed.some((x)=>String(x)===String(value))?value:fallback;}
function num(value,min,max,fallback,step=1){let n=Number(value);if(!Number.isFinite(n))n=fallback;n=Math.max(min,Math.min(max,n));return step?Math.round(n/step)*step:n;}
export function gameFamily(gameId){return ROOM_GAME_DEFS[gameId]?.family||null;}
export function gameCapacity(gameId,rules={}){return gameId==="qiguo"?Math.max(3,Math.min(7,Math.round(Number(rules.playerCount)||7))):2;}
export function normalizeRoomRules(gameId,input={}){
  const family=gameFamily(gameId),def=ROOM_RULE_DEFS[family],src=input&&typeof input==="object"?input:{};
  if(!def)return{};const out=structuredClone(def.defaults);
  if(family==="go"){
    out.ruleset=option(def,"ruleset",src.ruleset,out.ruleset);out.scoring=option(def,"scoring",src.scoring,out.scoring);out.komi=num(src.komi,0,20,out.komi,.5);out.koRule=option(def,"koRule",src.koRule,out.koRule);out.suicide=typeof src.suicide==="boolean"?src.suicide:out.suicide;out.mode=option(def,"mode",src.mode,out.mode);out.captureGoal=num(src.captureGoal,1,20,out.captureGoal,1);out.handicap=num(src.handicap,0,9,out.handicap,1);out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="gomoku"){
    out.variant=option(def,"variant",src.variant,out.variant);out.boardSize=Number(option(def,"boardSize",Number(src.boardSize),out.boardSize));out.opening=option(def,"opening",src.opening,out.opening);if(out.variant==="connect6")out.opening="none";out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="renju"){
    out.opening="free";out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="xiangqi"){
    out.stalemateLoss=typeof src.stalemateLoss==="boolean"?src.stalemateLoss:true;out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="chess"){
    out.variant=option(def,"variant",src.variant,out.variant);for(const k of ["threefold","fiftyMove","insufficient"])out[k]=typeof src[k]==="boolean"?src[k]:out[k];out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="reversi"){
    out.boardSize=Number(option(def,"boardSize",Number(src.boardSize),out.boardSize));out.objective=option(def,"objective",src.objective,out.objective);out.sideMode=option(def,"sideMode",src.sideMode,out.sideMode);
  }else if(family==="qiguo"){
    out.playerCount=num(src.playerCount,3,7,out.playerCount,1);out.drawMode=option(def,"drawMode",src.drawMode,out.drawMode);
  }
  return out;
}
export function normalizeRotation(value){return ["winner_stays","rotate_both","host_stays"].includes(value)?value:"winner_stays";}
export function normalizeRoomSettingsInput(input={},current={}){
  const gameId=ROOM_GAME_DEFS[input.gameId]?input.gameId:(ROOM_GAME_DEFS[current.gameId]?current.gameId:"gomoku");
  return {
    roomName:String(input.roomName??current.roomName??ROOM_GAME_DEFS[gameId].title).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,40)||ROOM_GAME_DEFS[gameId].title,
    gameId,rules:normalizeRoomRules(gameId,input.rules||{}),privateRoom:!!input.privateRoom,
    queueEnabled:gameId==="qiguo"?false:!!input.queueEnabled,rotationPolicy:normalizeRotation(input.rotationPolicy),
    clockConfig:gameId==="qiguo"?{mode:"untimed"}:normalizeClockConfig(input.clockConfig||{mode:"untimed"}),
    voiceEnabled:gameId==="qiguo"?false:!!input.voiceEnabled,
    playerChatSlowMs:Math.max(0,Math.min(60_000,Math.round(Number(input.playerChatSlowMs)||0))),
    spectatorChatSlowMs:Math.max(0,Math.min(60_000,Math.round(Number(input.spectatorChatSlowMs)||0))),
    focusGuardEnabled:input.focusGuardEnabled!==false,
    focusGuardAllowedLeaves:Math.max(0,Math.min(20,Math.round(Number(input.focusGuardAllowedLeaves)||0))),
  };
}
export const ROOM_SETTINGS_PUBLIC_SCHEMA={games:ROOM_GAME_DEFS,rules:ROOM_RULE_DEFS,clockPresets:{untimed:{mode:"untimed"},sudden10:{mode:"sudden_death",mainMs:600000},fischer5_3:{mode:"fischer",mainMs:300000,incrementMs:3000},fischer10_5:{mode:"fischer",mainMs:600000,incrementMs:5000},go20_5x30:{mode:"japanese_byoyomi",mainMs:1200000,byoPeriodMs:30000,byoPeriods:5},go30_5x30:{mode:"japanese_byoyomi",mainMs:1800000,byoPeriodMs:30000,byoPeriods:5}}};
