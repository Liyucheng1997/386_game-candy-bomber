// 程序化 Canvas 贴图
import * as THREE from 'three';

const cache = new Map();

function canvasTex(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  cache.set(key, t);
  return t;
}

const hex = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;

// 斜条纹（糖果棒、泡泡糖球）
export function stripeTex(c1, c2, count = 6, slant = 1) {
  return canvasTex(`stripe-${c1}-${c2}-${count}-${slant}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex(c1); ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hex(c2);
    const sw = w / count;
    for (let i = -count; i < count * 2; i++) {
      ctx.beginPath();
      const x = i * sw;
      ctx.moveTo(x, 0); ctx.lineTo(x + sw * 0.5, 0);
      ctx.lineTo(x + sw * 0.5 + w * slant, h); ctx.lineTo(x + w * slant, h);
      ctx.closePath(); ctx.fill();
    }
  });
}

// 竖条纹（纸杯、帽子）
export function vstripeTex(colors, count = 12) {
  return canvasTex(`vstripe-${colors.join()}-${count}`, 256, 64, (ctx, w, h) => {
    const sw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = hex(colors[i % colors.length]);
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }
  });
}

// 地板：2x2 格子，每格圆角瓷砖
export function floorTex(a, b, grout, W, H) {
  return canvasTex(`floor-${a}-${b}`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = grout; ctx.fillRect(0, 0, w, h);
    const s = w / 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const col = (x + y) % 2 === 0 ? a : b;
      const px = x * s + 6, py = y * s + 6, ps = s - 12;
      const g = ctx.createLinearGradient(px, py, px + ps, py + ps);
      g.addColorStop(0, shade(col, 12)); g.addColorStop(1, shade(col, -6));
      ctx.fillStyle = g;
      roundRect(ctx, px, py, ps, ps, 28); ctx.fill();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, px + 14, py + 12, ps * 0.45, 10, 5); ctx.fill();
      // 小糖粒点缀
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `hsla(${(Math.random() * 360) | 0},80%,75%,0.35)`;
        const rx = px + 30 + Math.random() * (ps - 60), ry = py + 30 + Math.random() * (ps - 60);
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(Math.random() * Math.PI);
        roundRect(ctx, -9, -3, 18, 6, 3); ctx.fill(); ctx.restore();
      }
    }
  }, { repeat: [W / 2, H / 2] });
}

// 威化饼纹理
export function waferTex(base = '#f4c97a', line = '#d9a24c') {
  return canvasTex(`wafer-${base}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = line; ctx.lineWidth = 10;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * w;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ctx.fillRect(x * 64 + 10, y * 64 + 10, 20, 8);
  });
}

// 饼干纹理（带小洞和巧克力豆）
export function cookieTex() {
  return canvasTex('cookie', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e8b56a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(${150 + Math.random() * 60},${90 + Math.random() * 40},40,0.25)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    ctx.fillStyle = '#5a3018';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(20 + Math.random() * 216, 20 + Math.random() * 216, 10 + Math.random() * 6, 8, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// 棒棒糖螺旋
export function swirlTex(c1, c2) {
  return canvasTex(`swirl-${c1}-${c2}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex(c1); ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = hex(c2); ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 10; a += 0.05) {
      const r = a * 3.9;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
  });
}

// 柔光贴图
export function glowTex() {
  return canvasTex('glow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}

// 地面：柔和的径向渐变 + 斑点
export function groundTex(color) {
  return canvasTex(`ground-${color}`, 512, 512, (ctx, w, h) => {
    const c = new THREE.Color(color);
    const base = '#' + c.getHexString();
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [10, 10] });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(col, amt) {
  const c = new THREE.Color(col);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt / 100)));
  return '#' + c.getHexString();
}
