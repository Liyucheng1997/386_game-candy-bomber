// 键盘 + 手柄输入。方向采用“后按优先”
const SCHEMES = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], bomb: ['Space'], item: ['KeyE', 'KeyQ'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], bomb: ['Enter', 'NumpadEnter', 'Numpad0'], item: ['ShiftRight', 'Slash', 'Numpad1'] },
];
// 单人模式时 1P 也可以用方向键
const SOLO_EXTRA = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], bomb: ['Enter', 'NumpadEnter'], item: ['ShiftRight'] };

export class Input {
  constructor() {
    this.held = new Set();
    this.stacks = [[], []];
    this.pressed = [{ bomb: false, item: false }, { bomb: false, item: false }];
    this.solo = true;
    this.padPrev = [{}, {}];
    this.onKey = null;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      if (this.onKey) this.onKey(e);
      if (e.repeat) return;
      this.held.add(e.code);
      for (let i = 0; i < 2; i++) {
        const s = this.scheme(i);
        for (const d of ['up', 'down', 'left', 'right']) {
          if (s[d].includes(e.code)) { this.stacks[i] = this.stacks[i].filter((x) => x !== d); this.stacks[i].push(d); }
        }
        if (s.bomb.includes(e.code)) this.pressed[i].bomb = true;
        if (s.item.includes(e.code)) this.pressed[i].item = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      for (let i = 0; i < 2; i++) {
        const s = this.scheme(i);
        for (const d of ['up', 'down', 'left', 'right']) {
          if (s[d].includes(e.code) && !s[d].some((k) => this.held.has(k))) this.stacks[i] = this.stacks[i].filter((x) => x !== d);
        }
      }
    });
    window.addEventListener('blur', () => { this.held.clear(); this.stacks = [[], []]; });
  }

  scheme(i) {
    const s = SCHEMES[i];
    if (i === 0 && this.solo) {
      const m = {};
      for (const k of Object.keys(s)) m[k] = [...s[k], ...SOLO_EXTRA[k]];
      return m;
    }
    if (i === 1 && this.solo) return { up: [], down: [], left: [], right: [], bomb: [], item: [] };
    return s;
  }

  setSolo(solo) { this.solo = solo; this.stacks = [[], []]; }

  pad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const list = [...pads].filter(Boolean);
    return list[i] || null;
  }

  // 返回 {dx, dz, bomb, item}
  read(i) {
    let dx = 0, dz = 0;
    const top = this.stacks[i][this.stacks[i].length - 1];
    if (top === 'up') dz = -1; else if (top === 'down') dz = 1; else if (top === 'left') dx = -1; else if (top === 'right') dx = 1;
    let bomb = this.pressed[i].bomb, item = this.pressed[i].item;
    this.pressed[i].bomb = this.pressed[i].item = false;

    const p = this.pad(i);
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
      let px = 0, pz = 0;
      if (b(14)) px = -1; else if (b(15)) px = 1;
      if (b(12)) pz = -1; else if (b(13)) pz = 1;
      if (!px && !pz) {
        if (Math.abs(ax) > 0.45 || Math.abs(ay) > 0.45) {
          if (Math.abs(ax) > Math.abs(ay)) px = Math.sign(ax); else pz = Math.sign(ay);
        }
      }
      if (px || pz) { dx = px; dz = pz; if (dx && dz) dz = 0; }
      const prev = this.padPrev[i];
      const A = b(0), B = b(1) || b(2);
      if (A && !prev.A) bomb = true;
      if (B && !prev.B) item = true;
      this.padPrev[i] = { A, B };
    }
    return { dx, dz, bomb, item };
  }

  clear() { this.pressed = [{ bomb: false, item: false }, { bomb: false, item: false }]; }
}
