// 核心玩法：网格、泡泡、水柱、道具、困泡泡、突然死亡、回合流程
import * as THREE from 'three';
import {
  W, H, BOMB_TIME, FLAME_TIME, TRAP_TIME, TRAP_SPEED, BASE_SPEED, SPEED_STEP, MAX_SPEED_LVL,
  MAX_BOMBS, MAX_RANGE, START_RANGE, ROUND_TIME, KICK_SPEED, INVULN_TIME,
  CHARACTERS, ITEMS, MAPS, TEAM_COLORS, TEAM_NAMES, DIRS, idx, inBounds, gx, gz,
} from './constants.js';
import * as M from './models.js';
import { buildWorld, animateWorld } from './world.js';
import { AIBrain } from './ai.js';

const SPAWNS = [[0, H - 1], [W - 1, 0], [W - 1, H - 1], [0, 0]];
const TEAM_SPAWNS = { A: [[0, H - 1], [0, 0]], B: [[W - 1, 0], [W - 1, H - 1]] };
const DROP_COLORS = [0xff6f9f, 0xffd23f, 0x52e0b8, 0x6c9dff, 0xb07cff, 0xff9a3c];

function rollItem() {
  const entries = Object.entries(ITEMS);
  let total = 0;
  for (const [, v] of entries) total += v.weight;
  let r = Math.random() * total;
  for (const [k, v] of entries) { r -= v.weight; if (r <= 0) return k; }
  return 'bomb';
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Game {
  constructor({ scene, camera, sound, fx, ui, input }) {
    this.scene = scene;
    this.camera = camera;
    this.sound = sound;
    this.fx = fx;
    this.ui = ui;
    this.input = input;
    this.level = new THREE.Group();
    scene.add(this.level);
    this.actors = new THREE.Group();
    scene.add(this.actors);
    this.world = null;
    this.worldId = null;
    this.state = 'idle';
    this.time = 0;
    this.frame = 0;
    this.players = [];
    this.paused = false;
    this.shake = 0;
    this.camFocus = null;
    this.grid = new Uint8Array(W * H);
    this.resetLevelState();
  }

  resetLevelState() {
    this.grid.fill(0);
    this.softMeshes = new Map();
    this.softColors = new Map();
    this.bombs = [];
    this.bombAt = new Map();
    this.items = new Map();
    this.flames = [];
    this.flameUntil = new Float32Array(W * H);
    this.flameOwner = new Array(W * H).fill(null);
    this.events = [];
    this.breaking = [];
    this.drops = [];
    this.dropPending = new Map();
    this.sudden = null;
    this.dangerFrame = -1;
  }

  /* ---------------- 关卡构建 ---------------- */
  ensureWorld(map) {
    if (this.worldId === map.id) return;
    if (this.world) this.scene.remove(this.world);
    this.world = buildWorld(this.scene, map);
    this.worldId = map.id;
  }

  clearLevel() {
    for (const b of this.bombs) b.mesh.mat.dispose();
    while (this.level.children.length) this.level.remove(this.level.children[0]);
    this.resetLevelState();
  }

  buildLevel(map, keepClear = []) {
    this.clearLevel();
    this.map = map;
    this.ensureWorld(map);
    const clear = new Set(keepClear);
    for (const [c, r] of SPAWNS) {
      for (const [dc, dr] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 1]]) {
        const cc = c === 0 ? c + dc : c - dc, rr = r === 0 ? r + dr : r - dr;
        clear.add(idx(cc, rr));
      }
    }
    let seed = 0;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = idx(c, r);
        const mc = Math.min(c, W - 1 - c), mr = Math.min(r, H - 1 - r);
        if (map.hard(c, r, mc, mr)) {
          this.grid[i] = 1;
          const variant = map.pillars[(c + r * 3) % map.pillars.length];
          const m = M.makeHardBlock(variant, seed++);
          m.position.set(gx(c), 0, gz(r));
          m.rotation.y = ((c * 7 + r * 3) % 4) * (Math.PI / 2);
          this.level.add(m);
        } else if (!clear.has(i) && Math.random() < map.density) {
          this.addSoft(i, map);
        }
      }
    }
  }

  addSoft(i, map) {
    this.grid[i] = 2;
    const variant = map.soft[(Math.random() * map.soft.length) | 0];
    const color = M.softPalette((Math.random() * 6) | 0);
    const m = M.makeSoftBlock(variant, color);
    const c = i % W, r = (i / W) | 0;
    m.position.set(gx(c), 0, gz(r));
    m.rotation.y = ((Math.random() * 4) | 0) * (Math.PI / 2);
    this.level.add(m);
    this.softMeshes.set(i, m);
    this.softColors.set(i, variant === 'choco' ? 0x7b4422 : variant === 'cookie' || variant === 'waffle' ? 0xe8b56a : color);
  }

  /* ---------------- 玩家 ---------------- */
  makePlayer(slot, charIdx, { isAI, ctrl = -1, team, name, difficulty }) {
    const def = CHARACTERS[charIdx];
    const model = M.makeBean(def);
    const bubble = M.makeTrapBubble();
    bubble.group.visible = false;
    model.root.add(bubble.group);
    const shieldOrb = M.makeShieldOrb();
    shieldOrb.visible = false;
    model.root.add(shieldOrb);
    const ringColor = this.mode === 'team' ? TEAM_COLORS[team] : def.color;
    const ring = new THREE.Mesh(M.geo('pRing', () => new THREE.RingGeometry(0.3, 0.4, 36)),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    model.root.add(ring);
    this.actors.add(model.root);
    const p = {
      slot, def, charIdx, isAI, ctrl, team, name, model, bubble, shieldOrb, ring,
      wins: 0, stats: { kills: 0, items: 0, bombs: 0, rescues: 0 },
      walkT: 0, blinkT: 2 + Math.random() * 3, squash: 0, facing: 0,
    };
    p.brain = isAI ? new AIBrain(p, this, difficulty) : null;
    return p;
  }

  resetPlayer(p, c, r) {
    Object.assign(p, {
      x: c, z: r, speedLvl: 0, speed: BASE_SPEED, maxBombs: 1, activeBombs: 0, range: START_RANGE,
      needles: 0, kick: false, shield: false, trapped: false, trapT: 0, trappedBy: null, dead: false,
      deathT: 0, invuln: 0, moving: false, facing: r === 0 ? 0 : Math.PI, dance: 0,
    });
    if (p.brain) { p.brain.path = []; p.brain.thinkT = 0.3 + Math.random() * 0.4; p.brain.bombCD = 0.6 + Math.random(); }
    const m = p.model;
    m.root.visible = true;
    m.root.scale.setScalar(1);
    m.root.position.set(gx(c), 0, gz(r));
    m.root.rotation.set(0, p.facing, 0);
    m.body.rotation.set(0, 0, 0);
    p.bubble.group.visible = false;
    p.shieldOrb.visible = false;
  }

  disposePlayers() {
    for (const p of this.players) this.actors.remove(p.model.root);
    this.players = [];
    this.ui.clearTags();
  }

  /* ---------------- 比赛流程 ---------------- */
  newMatch(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.disposePlayers();
    const used = new Set(opts.humans.map((h) => h.charIdx));
    const freeChars = CHARACTERS.map((_, i) => i).filter((i) => !used.has(i));
    const list = [];
    if (opts.mode === 'team') {
      const total = 4;
      opts.humans.forEach((h, k) => list.push({ charIdx: h.charIdx, isAI: false, ctrl: k, team: 'A', name: `${k + 1}P` }));
      while (list.filter((x) => x.team === 'A').length < 2) list.push({ charIdx: freeChars.shift(), isAI: true, team: 'A', name: '电脑' });
      while (list.length < total) list.push({ charIdx: freeChars.shift(), isAI: true, team: 'B', name: '电脑' });
    } else {
      opts.humans.forEach((h, k) => list.push({ charIdx: h.charIdx, isAI: false, ctrl: k, team: `P${k}`, name: `${k + 1}P` }));
      for (let k = 0; k < opts.aiCount; k++) list.push({ charIdx: freeChars.shift(), isAI: true, team: `C${k}`, name: '电脑' });
    }
    this.players = list.map((d, k) => this.makePlayer(k, d.charIdx, { ...d, difficulty: opts.difficulty }));
    this.input.setSolo(opts.humans.length === 1);
    this.teamWins = { A: 0, B: 0 };
    this.round = 0;
    this.ui.buildHUD(this.players, this.mode);
    for (const p of this.players) if (!p.isAI) this.ui.addTag(p.slot, p.name, p.def.css);
    this.startRound();
  }

  startRound() {
    this.round++;
    const map = this.opts.mapIdx === -1 ? MAPS[(this.round - 1) % MAPS.length] : MAPS[this.opts.mapIdx];
    this.buildLevel(map);
    const teamCount = { A: 0, B: 0 };
    this.players.forEach((p, k) => {
      let sp;
      if (this.mode === 'team') sp = TEAM_SPAWNS[p.team][teamCount[p.team]++];
      else sp = SPAWNS[k];
      this.resetPlayer(p, sp[0], sp[1]);
    });
    this.roundTime = ROUND_TIME;
    this.state = 'countdown';
    this.countT = 3.6;
    this.lastCount = 4;
    this.endPending = 0;
    this.camFocus = null;
    this.input.clear();
    this.ui.showScreen('game');
    this.ui.center(`第 ${this.round} 回合`, map.name, 'round');
    this.sound.startMusic(false);
  }

  setupShowcase() {
    this.state = 'showcase';
    this.mode = 'ffa';
    this.disposePlayers();
    const map = MAPS[0];
    const clear = [];
    for (let c = 4; c <= 10; c++) for (let r = 5; r <= 7; r++) clear.push(idx(c, r));
    this.buildLevel(map, clear);
    // 清掉中间的柱子，腾出舞台
    for (let k = 0; k < 4; k++) {
      const p = this.makePlayer(k, k, { isAI: false, team: 'x', name: '' });
      this.resetPlayer(p, 5.5 + k * 1.0, 6);
      p.facing = 0;
      p.dance = 0.01 + k * 0.45;
      this.players.push(p);
    }
    this.level.children.forEach((m) => {
      const c = Math.round(m.position.x + (W - 1) / 2), r = Math.round(m.position.z + (H - 1) / 2);
      if (c >= 5 && c <= 9 && r >= 5 && r <= 7) m.visible = false;
    });
  }

  /* ---------------- 每帧更新 ---------------- */
  update(dt) {
    this.frame++;
    if (this.paused) return;
    this.time += dt;
    if (this.world) animateWorld(this.world, dt, this.time);

    if (this.state === 'countdown') this.updateCountdown(dt);
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'roundEnd') this.updateRoundEnd(dt);

    if (this.state !== 'idle') {
      this.updateBombs(dt);
      this.updateEvents();
      this.updateFlames(dt);
      this.updateBreaking(dt);
      this.updateItems(dt);
      this.updateDrops(dt);
      for (const p of this.players) this.animatePlayer(p, dt);
      if (this.state !== 'showcase') this.updateTags();
      this.ui.updateHUD(this.players, this.roundTime, !!this.sudden, this.mode, this.teamWins);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  updateCountdown(dt) {
    this.countT -= dt;
    const n = Math.ceil(this.countT);
    if (n !== this.lastCount && n <= 3 && n >= 1) {
      this.lastCount = n;
      this.ui.center(String(n), '', 'count');
      this.sound.beep(false);
    }
    if (this.countT <= 0) {
      this.state = 'playing';
      this.ui.center('开始!', '', 'go');
      this.sound.beep(true);
      this.input.clear();
    }
  }

  updatePlaying(dt) {
    if (!this.sudden) this.roundTime -= dt;
    if (this.roundTime <= 0 && !this.sudden) {
      this.roundTime = 0;
      this.startSudden();
    }
    if (this.sudden) this.updateSudden(dt);

    for (const p of this.players) {
      if (p.dead) continue;
      const cmd = p.isAI ? p.brain.update(dt) : this.input.read(p.ctrl);
      this.controlPlayer(p, cmd, dt);
    }
    this.checkHits();
    this.checkTouches();
    this.checkRoundEnd(dt);
  }

  controlPlayer(p, cmd, dt) {
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.trapped) {
      p.trapT -= dt;
      if (cmd.item && p.needles > 0) {
        p.needles--;
        this.freePlayer(p, '救命针!');
        return;
      }
      if (p.trapT <= 0) { this.killPlayer(p, p.trappedBy); return; }
    }
    const speed = p.trapped ? TRAP_SPEED : p.speed;
    let dist = speed * dt;
    if (cmd.limit !== undefined) dist = Math.min(dist, cmd.limit);
    p.moving = false;
    if (cmd.dx || cmd.dz) {
      const ox = p.x, oz = p.z;
      if (cmd.dx) this.moveAxis(p, true, cmd.dx, dist);
      else this.moveAxis(p, false, cmd.dz, dist);
      p.facing = Math.atan2(cmd.dx, cmd.dz);
      p.moving = Math.abs(p.x - ox) + Math.abs(p.z - oz) > 1e-4;
      p.pushing = !p.moving;
    }
    if (cmd.bomb && !p.trapped) this.placeBomb(p);

    // 拾取道具
    if (!p.trapped) {
      const i = idx(Math.round(p.x), Math.round(p.z));
      const it = this.items.get(i);
      if (it) this.pickup(p, i, it);
    }
  }

  moveAxis(p, isX, s, dist) {
    const main = isX ? p.x : p.z, perp = isX ? p.z : p.x;
    const cm = Math.round(main), lane = Math.round(perp);
    const off = perp - lane;
    const blocked = (m, l) => (isX ? this.isBlockedFor(p, m, l) : this.isBlockedFor(p, l, m));
    const ahead = cm + s;
    const aheadBlocked = blocked(ahead, lane);
    const rel = (main - cm) * s;
    let nMain = main, nPerp = perp;
    if (aheadBlocked) {
      // 踢泡泡
      if (p.kick && rel >= -0.08 && Math.abs(off) < 0.25) {
        const bi = isX ? idx(ahead, lane) : idx(lane, ahead);
        const b = this.bombAt.get(bi);
        if (b && !b.moving && inBounds(isX ? ahead : lane, isX ? lane : ahead)) this.kickBomb(b, isX ? s : 0, isX ? 0 : s);
      }
      // 拐角辅助
      if (Math.abs(off) > 0.12) {
        const other = lane + Math.sign(off);
        if (!blocked(ahead, other) && !blocked(cm, other)) {
          const d = other - perp;
          nPerp = perp + Math.sign(d) * Math.min(Math.abs(d), dist);
          if (isX) p.z = nPerp; else p.x = nPerp;
          return;
        }
      }
      nPerp = perp - Math.sign(off) * Math.min(Math.abs(off), dist);
      if (rel < 0) nMain = s > 0 ? Math.min(main + dist, cm) : Math.max(main - dist, cm);
    } else {
      nPerp = perp - Math.sign(off) * Math.min(Math.abs(off), dist);
      nMain = main + s * dist;
    }
    if (isX) { p.x = nMain; p.z = nPerp; } else { p.z = nMain; p.x = nPerp; }
  }

  isBlockedFor(p, c, r) {
    if (!inBounds(c, r)) return true;
    const i = idx(c, r);
    if (this.grid[i]) return true;
    const b = this.bombAt.get(i);
    if (b && !b.passers.has(p)) return true;
    return false;
  }

  isSolidIdx(i) { return this.grid[i] !== 0 || this.bombAt.has(i); }

  /* ---------------- 泡泡 ---------------- */
  placeBomb(p) {
    const c = Math.round(p.x), r = Math.round(p.z);
    const i = idx(c, r);
    if (this.grid[i] || this.bombAt.has(i) || p.activeBombs >= p.maxBombs) return;
    const mesh = M.makeBomb(p.def.color);
    mesh.group.position.set(gx(c), 0, gz(r));
    this.level.add(mesh.group);
    const b = { c, r, x: c, z: r, timer: BOMB_TIME, range: p.range, owner: p, mesh, passers: new Set(), moving: null, age: 0, exploded: false };
    for (const o of this.players) {
      if (!o.dead && Math.abs(o.x - c) < 0.95 && Math.abs(o.z - r) < 0.95) b.passers.add(o);
    }
    this.bombs.push(b);
    this.bombAt.set(i, b);
    p.activeBombs++;
    p.stats.bombs++;
    p.squash = 1;
    this.sound.place();
  }

  kickBomb(b, dx, dz) {
    b.moving = { dx, dz };
    b.passers.clear();
    this.sound.kick();
    this.fx.dust(gx(b.x), gz(b.z), 5);
  }

  bombPathBlocked(c, r) {
    if (!inBounds(c, r)) return true;
    const i = idx(c, r);
    if (this.grid[i] || this.bombAt.has(i)) return true;
    for (const p of this.players) if (!p.dead && Math.round(p.x) === c && Math.round(p.z) === r) return true;
    return false;
  }

  updateBombs(dt) {
    for (const b of [...this.bombs]) {
      if (b.exploded) continue;
      b.age += dt;
      if (this.state === 'playing' || this.state === 'roundEnd') b.timer -= dt;
      // 离开泡泡所在格后不可再穿过
      for (const o of b.passers) {
        if (o.dead || Math.round(o.x) !== b.c || Math.round(o.z) !== b.r) b.passers.delete(o);
      }
      if (b.moving) this.slideBomb(b, dt);
      const g = b.mesh.group;
      g.position.set(gx(b.x), 0, gz(b.z));
      const urgency = 1 - b.timer / BOMB_TIME;
      const freq = 6 + urgency * 16;
      const pulse = Math.sin(b.age * freq) * (0.05 + urgency * 0.06);
      const pop = Math.min(1, b.age * 6);
      const spawn = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.3 : 1;
      b.mesh.inner.scale.set((1 + pulse) * spawn * pop, (1 - pulse * 0.8) * spawn * pop, (1 + pulse) * spawn * pop);
      if (b.moving) b.mesh.inner.rotation.x += dt * 12 * (b.moving.dz || 0), b.mesh.inner.rotation.z -= dt * 12 * (b.moving.dx || 0);
      else { b.mesh.inner.rotation.x *= 0.8; b.mesh.inner.rotation.z *= 0.8; }
      b.mesh.mat.emissiveIntensity = urgency > 0.6 ? (Math.sin(b.age * 30) * 0.5 + 0.5) * (urgency - 0.6) * 1.6 : 0;
      b.mesh.spark.scale.setScalar(0.8 + Math.random() * 0.6);
      b.mesh.glow.material.opacity = 0.6 + Math.random() * 0.4;
      if (b.timer <= 0) this.explode(b);
    }
  }

  slideBomb(b, dt) {
    const { dx, dz } = b.moving;
    let remaining = KICK_SPEED * dt;
    let guard = 0;
    while (remaining > 1e-5 && b.moving && guard++ < 10) {
      const toCenter = dx ? (b.c - b.x) * dx : (b.r - b.z) * dz;
      if (toCenter > 1e-4) {
        const m = Math.min(toCenter, remaining);
        b.x += dx * m; b.z += dz * m; remaining -= m;
        continue;
      }
      if (this.bombPathBlocked(b.c + dx, b.r + dz)) {
        b.x = b.c; b.z = b.r; b.moving = null;
        this.fx.dust(gx(b.x), gz(b.z), 4);
        break;
      }
      const m = Math.min(remaining, 0.5);
      b.x += dx * m; b.z += dz * m; remaining -= m;
      const nc = Math.round(b.x + dx * 1e-3), nr = Math.round(b.z + dz * 1e-3);
      if (nc !== b.c || nr !== b.r) {
        this.bombAt.delete(idx(b.c, b.r));
        b.c = nc; b.r = nr;
        this.bombAt.set(idx(nc, nr), b);
      }
    }
  }

  blastCells(c, r, range, isBomb = null) {
    const origin = idx(c, r);
    const hasBomb = isBomb || ((j) => j !== origin && this.bombAt.has(j));
    const out = [{ c, r, i: origin, kind: 'c', tip: false }];
    for (const [dx, dz] of DIRS) {
      for (let k = 1; k <= range; k++) {
        const nc = c + dx * k, nr = r + dz * k;
        if (!inBounds(nc, nr)) break;
        const i = idx(nc, nr);
        const g = this.grid[i];
        if (g === 1 || g === 3) break;
        const stop = g === 2 || hasBomb(i);
        out.push({ c: nc, r: nr, i, kind: dx ? 'x' : 'z', tip: k === range || stop });
        if (stop) break;
      }
    }
    return out;
  }

  explode(b) {
    if (b.exploded) return;
    b.exploded = true;
    b.x = b.c; b.z = b.r;
    this.bombs.splice(this.bombs.indexOf(b), 1);
    this.bombAt.delete(idx(b.c, b.r));
    b.owner.activeBombs = Math.max(0, b.owner.activeBombs - 1);
    this.level.remove(b.mesh.group);
    b.mesh.mat.dispose();
    const cells = this.blastCells(b.c, b.r, b.range);
    for (const cell of cells) {
      const i = cell.i;
      this.flameUntil[i] = Math.max(this.flameUntil[i], this.time + FLAME_TIME);
      this.flameOwner[i] = b.owner;
      this.spawnFlame(cell);
      if (this.grid[i] === 2) this.destroySoft(i);
      const ob = this.bombAt.get(i);
      if (ob && ob !== b && !ob.chained) { ob.chained = true; this.schedule(0.06, () => this.explode(ob)); }
      const it = this.items.get(i);
      if (it && it.born < this.time - 0.05) this.destroyItem(i);
      if (cell.tip || cell.kind === 'c') this.fx.splash(gx(cell.c), gz(cell.r), cell.kind === 'c' ? 14 : 5, cell.kind === 'c' ? 1.2 : 0.8);
    }
    this.sound.explode();
    this.shake = Math.min(1, this.shake + 0.35);
  }

  spawnFlame(cell) {
    const kind = cell.kind;
    const m = M.makeFlame(kind);
    m.position.set(gx(cell.c), 0, gz(cell.r));
    this.level.add(m);
    this.flames.push({ mesh: m, t: 0, life: FLAME_TIME, kind, tip: cell.tip, seed: Math.random() * 10 });
  }

  updateFlames(dt) {
    for (let k = this.flames.length - 1; k >= 0; k--) {
      const f = this.flames[k];
      f.t += dt;
      const p = f.t / f.life;
      if (p >= 1) { this.level.remove(f.mesh); this.flames.splice(k, 1); continue; }
      let s = p < 0.15 ? p / 0.15 : p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      s = Math.max(0.01, s);
      const wob = 1 + Math.sin(this.time * 40 + f.seed) * 0.06;
      if (f.kind === 'c') f.mesh.scale.setScalar(s * wob * (1 + (1 - p) * 0.15));
      else f.mesh.scale.set(f.tip ? 0.85 : 1, s * wob, s * wob);
    }
  }

  destroySoft(i) {
    this.grid[i] = 0;
    const m = this.softMeshes.get(i);
    this.softMeshes.delete(i);
    const c = i % W, r = (i / W) | 0;
    if (m) this.breaking.push({ mesh: m, t: 0 });
    this.fx.debris(gx(c), gz(r), this.softColors.get(i) || 0xffffff, 12);
    if (this.state === 'playing' && Math.random() < 0.48) {
      const type = rollItem();
      this.schedule(FLAME_TIME + 0.03, () => this.spawnItem(i, type));
    }
  }

  updateBreaking(dt) {
    for (let k = this.breaking.length - 1; k >= 0; k--) {
      const b = this.breaking[k];
      b.t += dt;
      const p = b.t / 0.22;
      if (p >= 1) { this.level.remove(b.mesh); this.breaking.splice(k, 1); continue; }
      const s = 1 + Math.sin(p * Math.PI) * 0.25;
      b.mesh.scale.set(s * (1 - p * 0.6), (1 - p) * 1.1, s * (1 - p * 0.6));
    }
  }

  schedule(delay, fn) { this.events.push({ t: this.time + delay, fn }); }
  updateEvents() {
    if (!this.events.length) return;
    const now = this.time;
    const due = this.events.filter((e) => e.t <= now);
    if (!due.length) return;
    this.events = this.events.filter((e) => e.t > now);
    due.forEach((e) => e.fn());
  }

  /* ---------------- 道具 ---------------- */
  spawnItem(i, type) {
    if (this.grid[i] || this.items.has(i)) return;
    if (this.state !== 'playing') return;
    const m = M.makeItem(type);
    const c = i % W, r = (i / W) | 0;
    m.group.position.set(gx(c), 0, gz(r));
    const glow = new THREE.Mesh(M.geo('itemGlow', () => new THREE.RingGeometry(0.26, 0.43, 32)), new THREE.MeshBasicMaterial({
      color: ITEMS[type].glow, transparent: true, opacity: 0.6, depthWrite: false,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    m.group.add(glow);
    this.level.add(m.group);
    this.items.set(i, { type, mesh: m, born: this.time, glow, seed: Math.random() * 6 });
    this.fx.sparkle(gx(c), 0.4, gz(r), ITEMS[type].glow, 6);
  }

  destroyItem(i) {
    const it = this.items.get(i);
    if (!it) return;
    this.items.delete(i);
    this.level.remove(it.mesh.group);
    it.glow.material.dispose();
    const c = i % W, r = (i / W) | 0;
    this.fx.ring(gx(c), 0.4, gz(r), 10);
  }

  updateItems() {
    for (const it of this.items.values()) {
      const age = this.time - it.born;
      const pop = Math.min(1, age * 5);
      const s = pop < 1 ? Math.sin(pop * Math.PI * 0.5) * (1 + Math.sin(pop * Math.PI) * 0.3) : 1;
      it.mesh.holder.scale.setScalar(s);
      it.mesh.holder.position.y = 0.48 + Math.sin(this.time * 3 + it.seed) * 0.07;
      it.mesh.model.rotation.y += 0.03;
      it.glow.material.opacity = 0.5 + Math.sin(this.time * 4 + it.seed) * 0.2;
      it.glow.rotation.z += 0.02;
    }
  }

  pickup(p, i, it) {
    const t = it.type;
    switch (t) {
      case 'bomb': p.maxBombs = Math.min(MAX_BOMBS, p.maxBombs + 1); break;
      case 'potion': p.range = Math.min(MAX_RANGE, p.range + 1); break;
      case 'max': p.range = MAX_RANGE; break;
      case 'skate': p.speedLvl = Math.min(MAX_SPEED_LVL, p.speedLvl + 1); p.speed = BASE_SPEED + p.speedLvl * SPEED_STEP; break;
      case 'needle': p.needles = Math.min(3, p.needles + 1); break;
      case 'kick': p.kick = true; break;
      case 'shield': p.shield = true; break;
    }
    p.stats.items++;
    this.items.delete(i);
    this.level.remove(it.mesh.group);
    it.glow.material.dispose();
    this.fx.sparkle(gx(p.x), 0.6, gz(p.z), ITEMS[t].glow, 12);
    this.sound.pickup();
    p.squash = 0.6;
    this.popupAt(p, ITEMS[t].tip, ITEMS[t].glow);
  }

  popupAt(p, text, color) {
    const v = new THREE.Vector3(gx(p.x), 1.3, gz(p.z));
    const s = this.project(v);
    this.ui.popup(s.x, s.y, text, '#' + new THREE.Color(color).getHexString());
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  /* ---------------- 伤害 / 困泡泡 ---------------- */
  checkHits() {
    for (const p of this.players) {
      if (p.dead || p.trapped || p.invuln > 0) continue;
      const i = idx(Math.round(p.x), Math.round(p.z));
      if (this.flameUntil[i] > this.time) {
        const by = this.flameOwner[i];
        if (p.shield) {
          p.shield = false;
          p.invuln = INVULN_TIME;
          this.sound.shield();
          this.fx.sparkle(gx(p.x), 0.5, gz(p.z), 0xff5fa2, 16);
          this.popupAt(p, '护盾抵挡!', 0xff5fa2);
        } else this.trapPlayer(p, by);
      }
    }
  }

  trapPlayer(p, by) {
    p.trapped = true;
    p.trapT = TRAP_TIME;
    p.trappedBy = by;
    p.trapAge = 0;
    p.bubble.group.visible = true;
    p.brain && (p.brain.path = []);
    this.sound.trap();
    this.fx.splash(gx(p.x), gz(p.z), 10, 0.8);
  }

  freePlayer(p, text) {
    p.trapped = false;
    p.invuln = INVULN_TIME;
    p.bubble.group.visible = false;
    this.fx.ring(gx(p.x), 0.5, gz(p.z), 20);
    this.sound.rescue();
    if (text) this.popupAt(p, text, 0x6be06b);
  }

  killPlayer(p, by) {
    if (p.dead) return;
    p.dead = true;
    p.trapped = false;
    p.deathT = 0;
    p.bubble.group.visible = false;
    p.shieldOrb.visible = false;
    if (by && by !== p) by.stats.kills++;
    this.fx.ring(gx(p.x), 0.5, gz(p.z), 26);
    this.fx.sparkle(gx(p.x), 0.6, gz(p.z), 0xfff3a0, 14);
    this.fx.confetti(gx(p.x), 0.6, gz(p.z), 14, 2);
    this.sound.pop();
    this.shake = Math.min(1, this.shake + 0.3);
    this.popupAt(p, '噗!', p.def.color);
  }

  checkTouches() {
    for (const t of this.players) {
      if (!t.trapped || t.dead) continue;
      if (TRAP_TIME - t.trapT < 0.35) continue; // 刚被困时短暂保护
      for (const o of this.players) {
        if (o === t || o.dead || o.trapped) continue;
        const d = Math.hypot(o.x - t.x, o.z - t.z);
        if (d > 0.62) continue;
        if (o.team === t.team) {
          o.stats.rescues++;
          this.freePlayer(t, '获救!');
        } else {
          this.killPlayer(t, o);
        }
        break;
      }
    }
  }

  checkRoundEnd(dt) {
    const alive = this.players.filter((p) => !p.dead);
    const teams = new Set(alive.map((p) => p.team));
    if (teams.size <= 1) {
      // 没有敌人了：被困的队友自动脱困
      for (const p of alive) if (p.trapped) this.freePlayer(p, '');
      if (!this.endPending) this.endPending = 1.1;
    }
    if (this.endPending) {
      this.endPending -= dt;
      if (this.endPending <= 0) this.finishRound();
    }
  }

  finishRound() {
    const alive = this.players.filter((p) => !p.dead);
    const team = alive.length ? alive[0].team : null;
    this.state = 'roundEnd';
    this.endT = 3.6;
    this.roundWinners = alive;
    let title, sub = '';
    const humans = this.players.filter((p) => !p.isAI);
    const humanWon = alive.some((p) => !p.isAI);
    if (!team) { title = '平局!'; sub = '大家一起被泡泡淹没啦'; this.sound.lose(); }
    else {
      if (this.mode === 'team') {
        this.teamWins[team]++;
        title = `${TEAM_NAMES[team]} 获胜!`;
      } else {
        alive[0].wins++;
        const w = alive[0];
        title = `${w.isAI ? w.def.name : w.name + ' ' + w.def.name} 获胜!`;
      }
      sub = `第 ${this.round} 回合`;
      if (humanWon || humans.length === 0) this.sound.win(); else this.sound.lose();
      for (const p of alive) { p.dance = 0.01; this.fx.confetti(gx(p.x), 1.2, gz(p.z), 50, 3); }
      const w0 = alive[0];
      this.camFocus = new THREE.Vector3(gx(w0.x), 0, gz(w0.z));
    }
    if (this.mode === 'team') {
      for (const p of this.players) p.wins = this.teamWins[p.team];
    }
    this.ui.center(title, sub, 'win');
    this.sound.stopMusic();
  }

  updateRoundEnd(dt) {
    this.checkHitsDuringEnd();
    this.endT -= dt;
    if (this.endT <= 0) {
      const need = this.opts.winsNeeded;
      const best = Math.max(...this.players.map((p) => p.wins));
      if (best >= need) this.endMatch();
      else this.startRound();
    }
  }

  checkHitsDuringEnd() { /* 回合结束后不再判定伤害 */ }

  endMatch() {
    this.state = 'matchEnd';
    this.ui.clearCenter();
    this.ui.clearTags();
    const ranking = [...this.players].sort((a, b) => b.wins - a.wins || b.stats.kills - a.stats.kills || b.stats.items - a.stats.items);
    let title;
    if (this.mode === 'team') {
      const t = this.teamWins.A >= this.teamWins.B ? 'A' : 'B';
      title = `${TEAM_NAMES[t]} 赢得比赛!`;
    } else {
      const w = ranking[0];
      title = `${w.isAI ? '电脑 ' : w.name + ' '}${w.def.name} 赢得比赛!`;
    }
    this.ui.showResult({ title, ranking, mode: this.mode, teamWins: this.teamWins });
    this.sound.win();
    for (const p of this.players) p.dance = p === ranking[0] ? 0.01 : 0;
  }

  /* ---------------- 突然死亡 ---------------- */
  startSudden() {
    this.sudden = { order: this.spiralOrder(), k: 0, t: 0.5 };
    this.ui.center('加时赛!', '糖块从天而降，快往中间跑!', 'sudden');
    this.sound.startMusic(true);
  }

  spiralOrder() {
    const out = [];
    let l = 0, t = 0, r = W - 1, b = H - 1;
    while (l <= r && t <= b) {
      for (let c = l; c <= r; c++) out.push(idx(c, t));
      for (let rr = t + 1; rr <= b; rr++) out.push(idx(r, rr));
      if (t < b) for (let c = r - 1; c >= l; c--) out.push(idx(c, b));
      if (l < r) for (let rr = b - 1; rr > t; rr--) out.push(idx(l, rr));
      l++; t++; r--; b--;
    }
    // 中心 5x3 区域放到最后，并且落得更慢，给最后的对决留时间
    const isCore = (i) => Math.abs((i % W) - 7) <= 2 && Math.abs(((i / W) | 0) - 6) <= 1;
    return [...out.filter((i) => !isCore(i)), ...out.filter(isCore)];
  }

  updateSudden(dt) {
    const sd = this.sudden;
    sd.t -= dt;
    while (sd.t <= 0 && sd.k < sd.order.length) {
      const i = sd.order[sd.k++];
      if (this.grid[i] === 1 || this.grid[i] === 3) continue;
      const core = Math.abs((i % W) - 7) <= 2 && Math.abs(((i / W) | 0) - 6) <= 1;
      sd.t += core ? 1.6 : 0.3;
      this.dropBlock(i);
    }
  }

  dropBlock(i) {
    const c = i % W, r = (i / W) | 0;
    const mesh = M.makeDropBlock(DROP_COLORS[(c + r) % DROP_COLORS.length]);
    mesh.position.set(gx(c), 10, gz(r));
    this.level.add(mesh);
    const warn = new THREE.Mesh(M.geo('warn', () => new THREE.RingGeometry(0.15, 0.42, 28)), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.7, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(gx(c), 0.03, gz(r));
    this.level.add(warn);
    const dur = 0.9;
    this.drops.push({ i, mesh, warn, t: 0, dur, landed: false });
    this.dropPending.set(i, this.time + dur);
  }

  updateDrops(dt) {
    for (let k = this.drops.length - 1; k >= 0; k--) {
      const d = this.drops[k];
      d.t += dt;
      if (!d.landed) {
        const p = Math.min(1, d.t / d.dur);
        d.mesh.position.y = 10 * (1 - p * p);
        d.warn.material.opacity = 0.4 + Math.sin(d.t * 25) * 0.3;
        d.warn.scale.setScalar(0.6 + p * 0.5);
        if (p >= 1) { d.landed = true; this.landBlock(d); }
      } else {
        const q = d.t - d.dur;
        const s = q < 0.25 ? 1 + Math.sin((q / 0.25) * Math.PI) * 0.18 : 1;
        d.mesh.scale.set(s, 2 - s, s);
        if (q > 0.3) { d.mesh.scale.set(1, 1, 1); this.drops.splice(k, 1); }
      }
    }
  }

  landBlock(d) {
    const i = d.i, c = i % W, r = (i / W) | 0;
    this.level.remove(d.warn);
    d.warn.material.dispose();
    this.dropPending.delete(i);
    if (this.grid[i] === 2) {
      const m = this.softMeshes.get(i);
      if (m) this.level.remove(m);
      this.softMeshes.delete(i);
    }
    this.grid[i] = 3;
    if (this.items.has(i)) this.destroyItem(i);
    const b = this.bombAt.get(i);
    if (b) {
      b.exploded = true;
      this.bombs.splice(this.bombs.indexOf(b), 1);
      this.bombAt.delete(i);
      b.owner.activeBombs = Math.max(0, b.owner.activeBombs - 1);
      this.level.remove(b.mesh.group);
    }
    for (const p of this.players) {
      if (!p.dead && Math.round(p.x) === c && Math.round(p.z) === r) this.killPlayer(p, null);
    }
    this.fx.dust(gx(c), gz(r), 8);
    this.sound.thud();
    this.shake = Math.min(1, this.shake + 0.12);
  }

  /* ---------------- 危险地图（供 AI 使用） ---------------- */
  getDanger() {
    if (this.dangerFrame !== this.frame) {
      this.dangerCache = this.computeDanger(null);
      this.dangerFrame = this.frame;
    }
    return this.dangerCache;
  }

  computeDanger(extra) {
    const N = W * H;
    const time = new Float32Array(N).fill(Infinity);
    const flame = new Float32Array(N);
    for (let i = 0; i < N; i++) flame[i] = Math.max(0, this.flameUntil[i] - this.time);
    const bombs = this.bombs.map((b) => ({ c: b.c, r: b.r, range: b.range, t: b.chained ? 0.06 : b.timer }));
    if (extra) bombs.push({ c: extra.c, r: extra.r, range: extra.range, t: extra.timer });
    const at = new Map();
    bombs.forEach((b, k) => at.set(idx(b.c, b.r), k));
    const cells = bombs.map((b) => {
      const o = idx(b.c, b.r);
      return this.blastCells(b.c, b.r, b.range, (j) => j !== o && at.has(j));
    });
    let changed = true, guard = 0;
    while (changed && guard++ < 30) {
      changed = false;
      for (let k = 0; k < bombs.length; k++) {
        for (const cell of cells[k]) {
          const o = at.get(cell.i);
          if (o !== undefined && o !== k && bombs[o].t > bombs[k].t) { bombs[o].t = bombs[k].t; changed = true; }
        }
      }
    }
    for (let k = 0; k < bombs.length; k++) {
      for (const cell of cells[k]) time[cell.i] = Math.min(time[cell.i], Math.max(0, bombs[k].t));
    }
    for (const [i, land] of this.dropPending) time[i] = Math.min(time[i], Math.max(0, land - this.time));
    return { time, flame };
  }

  /* ---------------- 角色动画 ---------------- */
  animatePlayer(p, dt) {
    const m = p.model;
    const root = m.root;
    if (p.dead) {
      p.deathT += dt;
      const t = p.deathT;
      root.position.y = t * 4 - t * t * 2;
      root.rotation.y += dt * 14;
      const s = Math.max(0, 1 - t * 0.9);
      root.scale.set(s * (1 + Math.sin(t * 20) * 0.1), s, s);
      if (s <= 0) root.visible = false;
      return;
    }
    root.position.x = gx(p.x);
    root.position.z = gz(p.z);
    if (!(p.dance > 0) || p.trapped) root.rotation.y = angleLerp(root.rotation.y, p.facing, Math.min(1, dt * 14));

    const body = m.body, bob = m.bob;
    p.squash = Math.max(0, p.squash - dt * 4);
    const sq = Math.sin(p.squash * Math.PI) * p.squash;

    // 眨眼
    p.blinkT -= dt;
    const blink = p.blinkT < 0.1 && p.blinkT > 0;
    if (p.blinkT < 0) p.blinkT = 2 + Math.random() * 3.5;
    for (const e of m.eyes) e.scale.y = blink ? 0.15 : 1;
    if (m.spinner) m.spinner.rotation.y += dt * (p.moving ? 30 : 8);

    if (p.trapped) {
      p.trapAge = (p.trapAge || 0) + dt;
      const k = Math.min(1, p.trapAge * 5);
      root.position.y = 0.18 * k + Math.sin(this.time * 3) * 0.05;
      const bs = (k < 1 ? k * (1 + Math.sin(k * Math.PI) * 0.3) : 1) * (1 + Math.sin(this.time * 5) * 0.03);
      p.bubble.group.scale.set(bs, bs * (1 - Math.sin(this.time * 5) * 0.03), bs);
      p.bubble.mat.opacity = p.trapT < 1.3 ? 0.25 + (Math.sin(this.time * 30) * 0.5 + 0.5) * 0.35 : 0.32;
      p.bubble.mat.color.setHex(p.trapT < 1.3 ? 0xffc0d0 : 0xd8f6ff);
      // 挣扎
      m.arms[0].rotation.z = -2.4 + Math.sin(this.time * 16) * 0.5;
      m.arms[1].rotation.z = 2.4 - Math.sin(this.time * 16 + 1) * 0.5;
      m.arms[0].rotation.x = m.arms[1].rotation.x = 0;
      body.rotation.z = Math.sin(this.time * 6) * 0.15;
      body.rotation.x = 0;
      m.feet[0].position.z = 0.03 + Math.sin(this.time * 18) * 0.06;
      m.feet[1].position.z = 0.03 - Math.sin(this.time * 18) * 0.06;
      bob.position.y = 0;
      body.scale.set(1, 1, 1);
    } else {
      root.position.y = 0;
      body.rotation.z *= 0.8;
      if (p.dance > 0) {
        // 胜利舞蹈
        p.dance += dt;
        const t = p.dance;
        bob.position.y = Math.abs(Math.sin(t * 5)) * 0.35;
        if (this.state === 'showcase') {
          // 菜单展示：面朝镜头蹦跳
          const face = Math.atan2(this.camera.position.x - root.position.x, this.camera.position.z - root.position.z);
          root.rotation.y = angleLerp(root.rotation.y, face + Math.sin(t * 2) * 0.3, Math.min(1, dt * 6));
        } else root.rotation.y += dt * 2.5;
        m.arms[0].rotation.z = -2.6 + Math.sin(t * 10) * 0.4;
        m.arms[1].rotation.z = 2.6 - Math.sin(t * 10) * 0.4;
        body.scale.set(1, 1, 1);
      } else if (p.moving) {
        p.walkT += dt * p.speed * 2.6;
        const w = p.walkT;
        bob.position.y = Math.abs(Math.sin(w)) * 0.07;
        m.feet[0].position.z = 0.03 + Math.sin(w) * 0.11;
        m.feet[1].position.z = 0.03 - Math.sin(w) * 0.11;
        m.feet[0].position.y = 0.055 + Math.max(0, Math.sin(w)) * 0.05;
        m.feet[1].position.y = 0.055 + Math.max(0, -Math.sin(w)) * 0.05;
        m.arms[0].rotation.x = Math.sin(w) * 0.9;
        m.arms[1].rotation.x = -Math.sin(w) * 0.9;
        m.arms[0].rotation.z = -0.42; m.arms[1].rotation.z = 0.42;
        body.rotation.x = 0.12;
        body.rotation.z = Math.sin(w) * 0.05;
      } else {
        const t = this.time * 2.2 + p.slot;
        bob.position.y *= 0.8;
        m.feet[0].position.set(-0.12, 0.055, 0.03);
        m.feet[1].position.set(0.12, 0.055, 0.03);
        m.arms[0].rotation.x *= 0.85; m.arms[1].rotation.x *= 0.85;
        m.arms[0].rotation.z = -0.42 - Math.sin(t) * 0.06;
        m.arms[1].rotation.z = 0.42 + Math.sin(t) * 0.06;
        body.rotation.x *= 0.85;
        const br = Math.sin(t) * 0.02;
        body.scale.set(1 - br * 0.5, 1 + br, 1 - br * 0.5);
      }
      if (sq > 0) body.scale.set(1 + sq * 0.22, 1 - sq * 0.28, 1 + sq * 0.22);
      else if (p.moving || p.dance > 0) body.scale.set(1, 1, 1);
    }
    // 护盾 / 无敌闪烁
    p.shieldOrb.visible = p.shield;
    if (p.shield) { p.shieldOrb.rotation.y += dt * 3; p.shieldOrb.position.y = Math.sin(this.time * 3) * 0.05; }
    m.bob.visible = !(p.invuln > 0 && Math.sin(this.time * 40) > 0.3);
    p.ring.visible = !p.trapped;
  }

  updateTags() {
    for (const p of this.players) {
      if (p.isAI) continue;
      const v = new THREE.Vector3(gx(p.x), 1.35 + (p.trapped ? 0.3 : 0), gz(p.z));
      const s = this.project(v);
      this.ui.setTag(p.slot, s.x, s.y, !p.dead && this.state !== 'matchEnd');
    }
  }
}
