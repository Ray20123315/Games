export const CARD_GAME_CATALOG = Object.freeze({
  poker_holdem:Object.freeze({id:"poker_holdem",family:"poker",title:"德州撲克 Texas Hold’em",short:"Showdown 無下注",description:"2～6 人。每人 2 張底牌，依序公開 Flop／Turn／River；每條街可 Stay 或 Fold，最後以最佳五張牌比大小。第一階段不含下注與真實貨幣。",minPlayers:2,maxPlayers:6}),
  poker_draw:Object.freeze({id:"poker_draw",family:"poker",title:"五張抽牌撲克",short:"Five-card Draw",description:"2～6 人。每人 5 張牌，各有一次更換 0～3 張的機會，完成後直接攤牌比較標準牌型。無下注。",minPlayers:2,maxPlayers:6}),
  uno:Object.freeze({id:"uno",family:"uno",title:"UNO 相容玩法",short:"顏色／數字配對",description:"2～6 人。配對顏色或數字，支援 Skip、Reverse、Draw Two、Wild、Wild Draw Four；使用 BoardVerse 自製文字牌面。",minPlayers:2,maxPlayers:6}),
  crazy_eights:Object.freeze({id:"crazy_eights",family:"shedding",title:"Crazy Eights 八張鬼牌",short:"52 張牌脫手遊戲",description:"2～6 人。依花色或點數出牌，8 為萬用牌並指定下一個花色；最先出完手牌者獲勝。",minPlayers:2,maxPlayers:6}),
});
export function cardGameConfig(id){return CARD_GAME_CATALOG[String(id||"")]||null;}
