// 电脑玩家：危险地图 + BFS 寻路 + 评分决策
import { W, H, BOMB_TIME, FLAME_TIME, DIRS, idx, inBounds } from './constants.js';

const CFG = {
  easy:   { think: 0.45, rand: 1.2, aggro: 0.25, itemRange: 5, bombPause: 1.4, needleDelay: 1.8, suicide: 0.05, attackRange: 2 },
  normal: { think: 0.2, rand: 0.5, aggro: 0.85, itemRange: 9, bombPause: 0.6, needleDelay: 0.8, suicide: 0.0, attackRange: 4 },
  hard:   { think: 0.1, rand: 0.15, aggro: 1.4, itemRange: 14, bombPause: 0.25, needleDelay: 0.3, suicide: 0.0, attackRange: 6 },
};

const ITEM_VALUE = { bomb: 3.2, potion: 3, skate: 2.6, needle: 2.2, kick: 1.6, max: 4.5, shield: 3 };

export class AIBrain {
  constructor(player, game, difficulty = 'normal') {
    this.p = player;
    this.g = game;
    this.cfg = CFG[difficulty] || CFG.normal;
    this.thinkT = Math.random() * 0.5 + 0.2;
    this.bombCD = 0.5 + Math.random();
    this.path = [];
    this.needleT = 0;
    this.wantBomb = false;
  }

  update(dt) {
    const p = this.p;
    this.thinkT -= dt;
    this.bombCD -= dt;
    let bomb = false, item = false;

    if (p.trapped) {
      if (p.needles > 0) {
        this.needleT += dt;
        if (this.needleT > this.cfg.needleDelay) { item = true; this.needleT = 0; }
      }
      if (this.thinkT <= 0) { this.thinkT = 0.3; this.thinkTrapped(); }
      return { ...this.follow(), bomb: false, item };
    }
    this.needleT = 0;

    if (this.thinkT <= 0) {
      this.thinkT = this.cfg.think * (0.75 + Math.random() * 0.5);
      bomb = this.think();
    }
    // 路径上的下一格突然变危险 -> 立即重新思考
    if (this.path.length) {
      const D = this.g.getDanger();
      const n = this.path[0];
      if (this.g.isSolidIdx(n) || D.flame[n] > 0.05) { this.path = []; this.thinkT = 0; }
    }
    return { ...this.follow(), bomb, item };
  }

  bfs(start, D, stepT, ignoreDanger = false) {
    const g = this.g;
    const dist = new Int16Array(W * H).fill(-1);
    const prev = new Int16Array(W * H).fill(-1);
    const q = [start];
    dist[start] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const c = i % W, r = (i / W) | 0;
      for (const [dx, dz] of DIRS) {
        const nc = c + dx, nr = r + dz;
        if (!inBounds(nc, nr)) continue;
        const ni = idx(nc, nr);
        if (dist[ni] >= 0 || g.isSolidIdx(ni)) continue;
        if (!ignoreDanger) {
          const tArr = (dist[i] + 1) * stepT;
          const tEnter = tArr - stepT * 0.6, tLeave = tArr + stepT * 0.6;
          if (D.flame[ni] > tEnter) continue;
          const te = D.time[ni];
          if (te < Infinity && te < tLeave + 0.2 && te + FLAME_TIME + 0.15 > tEnter) continue;
        }
        dist[ni] = dist[i] + 1;
        prev[ni] = i;
        q.push(ni);
      }
    }
    return { dist, prev, order: q };
  }

  setPath(res, target) {
    const path = [];
    let i = target;
    while (i >= 0 && res.dist[i] > 0) { path.push(i); i = res.prev[i]; }
    path.reverse();
    this.path = path;
  }

  isSafe(D, i) { return D.time[i] === Infinity && D.flame[i] <= 0; }

  think() {
    const g = this.g, p = this.p, cfg = this.cfg;
    const D = g.getDanger();
    const start = idx(Math.round(p.x), Math.round(p.z));
    const stepT = 1 / p.speed;
    const res = this.bfs(start, D, stepT);

    // 1) 身处危险：逃到最近的安全格
    if (!this.isSafe(D, start)) {
      let best = -1, bestD = 1e9, fallback = -1, fbT = -1;
      for (const i of res.order) {
        if (this.isSafe(D, i)) {
          const d = res.dist[i] + Math.random() * 0.5;
          if (d < bestD) { bestD = d; best = i; }
        } else if (D.time[i] > fbT && D.flame[i] <= 0) { fbT = D.time[i]; fallback = i; }
      }
      if (best < 0) {
        // 退而求其次：忽略危险找安全格
        const r2 = this.bfs(start, D, stepT, true);
        for (const i of r2.order) if (this.isSafe(D, i)) { this.setPath(r2, i); return false; }
        if (fallback >= 0) this.setPath(res, fallback);
        return false;
      }
      this.setPath(res, best);
      return false;
    }

    const enemies = g.players.filter((o) => o !== p && !o.dead && o.team !== p.team);
    const mates = g.players.filter((o) => o !== p && !o.dead && o.team === p.team);

    // 2) 是否就地放泡泡
    if (p.activeBombs < p.maxBombs && this.bombCD <= 0) {
      const v = this.bombValue(start, enemies, D);
      const threshold = 0.9;
      if (v >= threshold && (this.safeToBomb(start, stepT) || Math.random() < cfg.suicide)) {
        this.bombCD = cfg.bombPause;
        this.thinkT = 0.02;
        this.path = [];
        return true;
      }
    }

    // 3) 评分选择目标格
    let best = -1, bestS = -1e9;
    const canBombSoon = p.activeBombs < p.maxBombs;
    // 场上可炸方块越少，越倾向于追击
    let softLeft = 0;
    for (let k = 0; k < W * H; k++) if (g.grid[k] === 2) softLeft++;
    const huntW = cfg.aggro * (softLeft < 25 ? 0.5 : softLeft < 55 ? 0.3 : 0.15);
    for (const i of res.order) {
      if (!this.isSafe(D, i)) continue;
      const d = res.dist[i];
      let s = -d * 0.32 + Math.random() * cfg.rand;
      const it = g.items.get(i);
      if (it && d <= cfg.itemRange) {
        let v = ITEM_VALUE[it.type] || 1;
        if (it.type === 'skate' && p.speedLvl >= 4) v = 0.3;
        if (it.type === 'kick' && p.kick) v = 0.2;
        if ((it.type === 'potion' || it.type === 'max') && p.range >= 7) v = 0.4;
        s += v * 2.2;
      }
      for (const e of enemies) {
        if (e.trapped && Math.round(e.x) === i % W && Math.round(e.z) === ((i / W) | 0)) s += 30;
      }
      for (const m of mates) {
        if (m.trapped && Math.round(m.x) === i % W && Math.round(m.z) === ((i / W) | 0)) s += 35;
      }
      if (canBombSoon && d <= 10) s += this.bombValue(i, enemies, D) * 1.1;
      // 主动逼近敌人
      if (huntW > 0) {
        const c = i % W, r = (i / W) | 0;
        let md = 99;
        for (const e of enemies) if (!e.trapped) md = Math.min(md, Math.abs(c - e.x) + Math.abs(r - e.z));
        if (md < 99) s += Math.max(0, 7 - md) * huntW;
      }
      if (s > bestS) { bestS = s; best = i; }
    }

    // 4) 没什么可做：靠近敌人
    if (best < 0 || bestS < 0.25) {
      let tgt = -1, td = 1e9;
      for (const i of res.order) {
        if (!this.isSafe(D, i)) continue;
        const c = i % W, r = (i / W) | 0;
        for (const e of enemies) {
          const md = Math.abs(c - e.x) + Math.abs(r - e.z) + Math.random();
          if (md < td) { td = md; tgt = i; }
        }
      }
      if (tgt >= 0) best = tgt;
    }

    if (best >= 0 && best !== start) this.setPath(res, best);
    else this.path = [];
    return false;
  }

  bombValue(i, enemies, D) {
    const g = this.g, p = this.p;
    const c = i % W, r = (i / W) | 0;
    const cells = g.blastCells(c, r, p.range, (j) => j !== i && g.bombAt.has(j));
    let v = 0;
    for (const cell of cells) {
      if (g.grid[cell.i] === 2) v += D.time[cell.i] < Infinity ? 0.15 : 1;
      if (g.items.has(cell.i) && cell.i !== i) v -= 0.6; // 别炸掉道具
    }
    for (const e of enemies) {
      if (e.trapped) continue;
      const ec = Math.round(e.x), er = Math.round(e.z);
      for (const cell of cells) {
        if (cell.c === ec && cell.r === er) {
          const dist = Math.abs(ec - c) + Math.abs(er - r);
          if (dist <= this.cfg.attackRange) v += 2 * this.cfg.aggro;
        }
      }
      // 贴身逼近
      const md = Math.abs(ec - c) + Math.abs(er - r);
      if (md <= 1) v += 0.8 * this.cfg.aggro;
      else if (md <= 2) v += 0.35 * this.cfg.aggro;
    }
    return v;
  }

  safeToBomb(start, stepT) {
    const g = this.g, p = this.p;
    const c = start % W, r = (start / W) | 0;
    const D2 = g.computeDanger({ c, r, range: p.range, timer: BOMB_TIME });
    const res = this.bfs(start, D2, stepT);
    for (const i of res.order) {
      if (i === start) continue;
      if (this.isSafe(D2, i) && res.dist[i] * stepT < BOMB_TIME - 0.6) return true;
    }
    return false;
  }

  thinkTrapped() {
    const g = this.g, p = this.p;
    const mates = g.players.filter((o) => o !== p && !o.dead && !o.trapped && o.team === p.team);
    const start = idx(Math.round(p.x), Math.round(p.z));
    if (!mates.length) { this.path = []; return; }
    const res = this.bfs(start, g.getDanger(), 1 / p.speed, true);
    let best = -1, bd = 1e9;
    for (const m of mates) {
      const i = idx(Math.round(m.x), Math.round(m.z));
      if (res.dist[i] >= 0 && res.dist[i] < bd) { bd = res.dist[i]; best = i; }
    }
    if (best >= 0) this.setPath(res, best); else this.path = [];
  }

  follow() {
    const p = this.p;
    while (this.path.length) {
      const n = this.path[0];
      const nc = n % W, nr = (n / W) | 0;
      const ox = nc - p.x, oz = nr - p.z;
      if (Math.abs(ox) < 0.06 && Math.abs(oz) < 0.06) { this.path.shift(); continue; }
      if (Math.abs(ox) >= Math.abs(oz)) return { dx: Math.sign(ox), dz: 0, limit: Math.abs(ox) };
      return { dx: 0, dz: Math.sign(oz), limit: Math.abs(oz) };
    }
    // 回到格子中心
    const c = Math.round(p.x), r = Math.round(p.z);
    const ox = c - p.x, oz = r - p.z;
    if (Math.abs(ox) > 0.04) return { dx: Math.sign(ox), dz: 0, limit: Math.abs(ox) };
    if (Math.abs(oz) > 0.04) return { dx: 0, dz: Math.sign(oz), limit: Math.abs(oz) };
    return { dx: 0, dz: 0 };
  }
}
