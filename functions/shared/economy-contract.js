export const ENERGY_MAX = 3;
export const ENERGY_REFILL_MS = 30 * 60 * 1000;

export const SHOP_CATALOG = Object.freeze([
  {id:'default-theme', slot:'appTheme', label:'ORIGINAL', price:0},
  {id:'pixel-theme', slot:'appTheme', label:'PIXEL ARCADE', price:180},
  {id:'neon-theme', slot:'appTheme', label:'NEON REACTOR', price:220},
  {id:'neon-grid', slot:'boardTheme', label:'NEON GRID', price:250},
  {id:'crystal', slot:'blockSkin', label:'CRYSTAL', price:300},
  {id:'jelly', slot:'blockSkin', label:'JELLY POP', price:350},
  {id:'prism', slot:'blockSkin', label:'PRISM CORE', price:450},
  {id:'pulse', slot:'clearEffect', label:'PULSE', price:250},
  {id:'night-drive', slot:'lobbyBgm', label:'NIGHT DRIVE', price:400},
  {id:'chroma-line', slot:'profileFrame', label:'CHROMA LINE', price:200},
]);

export const DAILY_MISSIONS = Object.freeze([
  {id:'daily-games', label:'랭크 게임 2회 종료', field:'games', target:2, reward:20},
  {id:'daily-clears', label:'블록 80셀 제거', field:'clears', target:80, reward:25},
  {id:'daily-reactors', label:'리액터 2회 발동', field:'reactors', target:2, reward:25},
]);

export const WEEKLY_MISSIONS = Object.freeze([
  {id:'weekly-games', label:'랭크 게임 10회 종료', field:'games', target:10, reward:80},
  {id:'weekly-clears', label:'블록 500셀 제거', field:'clears', target:500, reward:100},
  {id:'weekly-chain-games', label:'3연쇄 이상 3게임 달성', field:'chainGames', target:3, reward:100},
  {id:'weekly-level', label:'레벨 10 이상 달성', field:'levelGames', target:1, reward:80},
]);
