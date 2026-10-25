// 全局常量与配置
export const W = 15;
export const H = 13;

export const BOMB_TIME = 2.6;      // 泡泡爆炸倒计时（秒）
export const FLAME_TIME = 0.55;    // 水柱持续时间
export const TRAP_TIME = 4.5;      // 被困泡泡内的时间
export const TRAP_SPEED = 0.75;    // 被困时移动速度（格/秒）
export const BASE_SPEED = 3.2;
export const SPEED_STEP = 0.5;
export const MAX_SPEED_LVL = 5;
export const MAX_BOMBS = 8;
export const MAX_RANGE = 8;
export const START_RANGE = 2;
export const ROUND_TIME = 120;
export const KICK_SPEED = 9;
export const INVULN_TIME = 1.4;

export const CHARACTERS = [
  { id: 'strawberry', name: '草莓豆', color: 0xff6f9f, hat: 'bow', hatColor: 0xff2e63, css: '#ff6f9f' },
  { id: 'mint', name: '薄荷豆', color: 0x52e0b8, hat: 'leaf', hatColor: 0x3bb54a, css: '#52e0b8' },
  { id: 'lemon', name: '柠檬豆', color: 0xffd23f, hat: 'propeller', hatColor: 0xff5d5d, css: '#ffd23f' },
  { id: 'blueberry', name: '蓝莓豆', color: 0x6c9dff, hat: 'ears', hatColor: 0xffb3d1, css: '#6c9dff' },
  { id: 'grape', name: '葡萄豆', color: 0xb07cff, hat: 'crown', hatColor: 0xffc93c, css: '#b07cff' },
  { id: 'orange', name: '香橙豆', color: 0xff9a3c, hat: 'cap', hatColor: 0x2e86de, css: '#ff9a3c' },
];

export const TEAM_COLORS = { A: 0xff4d6d, B: 0x3d8bff };
export const TEAM_CSS = { A: '#ff4d6d', B: '#3d8bff' };
export const TEAM_NAMES = { A: '草莓队', B: '蓝莓队' };

export const ITEMS = {
  bomb:   { name: '糖果泡泡', tip: '泡泡 +1', weight: 30, icon: '🫧', glow: 0xff7eb6 },
  potion: { name: '能量药水', tip: '威力 +1', weight: 30, icon: '💧', glow: 0x4fc3ff },
  skate:  { name: '旱冰鞋',   tip: '速度 +1', weight: 17, icon: '🛼', glow: 0xffd23f },
  needle: { name: '救命针',   tip: '获得救命针', weight: 8, icon: '📍', glow: 0xd0d6e0 },
  kick:   { name: '踢踢鞋',   tip: '可以踢泡泡', weight: 6, icon: '👟', glow: 0x6be06b },
  max:    { name: '满级药水', tip: '威力 MAX!', weight: 3, icon: '🧪', glow: 0xff4040 },
  shield: { name: '果冻护盾', tip: '获得护盾', weight: 5, icon: '💗', glow: 0xff5fa2 },
};

// 地图：图案函数基于镜像坐标 (mc, mr)，保证左右上下对称
export const MAPS = [
  {
    id: 'town', name: '糖果小镇', desc: '经典棋盘布局，四平八稳',
    floorA: '#ffd3e3', floorB: '#ffefc6', grout: '#eab0c6',
    ground: 0xa8ecc9, sky: ['#7fd0ff', '#ffd6ec', '#fff1d6'],
    hard: (c, r) => c % 2 === 1 && r % 2 === 1,
    pillars: ['cane', 'cupcake'],
    soft: ['gift', 'gift', 'jelly', 'choco'],
    density: 0.72,
  },
  {
    id: 'garden', name: '饼干花园', desc: '中央开阔，适合混战',
    floorA: '#f3d9a8', floorB: '#d9f0bd', grout: '#cfb27e',
    ground: 0xbdf0a0, sky: ['#9fe3ff', '#e9f7ff', '#fff6cf'],
    hard: (c, r, mc, mr) => c % 2 === 1 && r % 2 === 1 && !(mc >= 5 && mr >= 5),
    pillars: ['macaron', 'cupcake'],
    soft: ['waffle', 'gift', 'waffle', 'jelly'],
    density: 0.66,
  },
  {
    id: 'ice', name: '冰淇淋广场', desc: '缺口众多，路线多变',
    floorA: '#cfe9ff', floorB: '#e6daff', grout: '#aac6ea',
    ground: 0xe7f6ff, sky: ['#a6c8ff', '#f2e6ff', '#ffffff'],
    hard: (c, r, mc, mr) => c % 2 === 1 && r % 2 === 1 && !(mc % 4 === 3 && mr % 4 === 3),
    pillars: ['gumdrop', 'cane'],
    soft: ['jelly', 'gift', 'jelly', 'choco'],
    density: 0.78,
  },
];

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const idx = (c, r) => r * W + c;
export const inBounds = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
export const gx = (c) => c - (W - 1) / 2;
export const gz = (r) => r - (H - 1) / 2;
