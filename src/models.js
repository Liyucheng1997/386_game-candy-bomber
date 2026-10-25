// 程序化建模：糖豆人、糖果泡泡、方块、道具、装饰
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

const geoCache = new Map();
export function geo(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}
const matCache = new Map();
export function candy(color, opts = {}) {
  const key = 'c' + color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshPhysicalMaterial({
      color, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, ...opts,
    }));
  }
  return matCache.get(key);
}
export function matte(color, opts = {}) {
  const key = 'm' + color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return matCache.get(key);
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// 把同材质的网格合并，减少 draw call
export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const keep = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) { keep.push(o); return; }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const k = o.material.uuid;
    if (!byMat.has(k)) byMat.set(k, { mat: o.material, list: [], cast: o.castShadow });
    byMat.get(k).list.push(g);
  });
  const out = new THREE.Group();
  out.position.copy(group.position); out.rotation.copy(group.rotation); out.scale.copy(group.scale);
  for (const { mat, list } of byMat.values()) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true; m.receiveShadow = true;
    out.add(m);
    list.forEach((g) => g.dispose());
  }
  for (const o of keep) {
    const c = new THREE.Mesh(o.geometry, o.material);
    new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    c.castShadow = true; c.receiveShadow = true;
    out.add(c);
  }
  return out;
}

function lighten(hex, amt = 0.25) {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color(0xffffff), amt).getHex();
}
function darken(hex, amt = 0.25) {
  const c = new THREE.Color(hex);
  return c.lerp(new THREE.Color(0x000000), amt).getHex();
}

/* ======================== 糖豆人 ======================== */
export function makeBean(def) {
  const root = new THREE.Group();
  const bob = new THREE.Group(); root.add(bob);
  const body = new THREE.Group(); bob.add(body);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: def.color, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.15,
    sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff),
  });
  const torso = mesh(geo('beanBody', () => new THREE.CapsuleGeometry(0.27, 0.26, 10, 28)), bodyMat, 0, 0.48, 0);
  body.add(torso);

  // 肚皮
  const belly = mesh(geo('belly', () => new THREE.SphereGeometry(0.2, 24, 16)), candy(lighten(def.color, 0.55), { roughness: 0.45 }), 0, 0.37, 0.155);
  belly.scale.set(0.95, 1.05, 0.62);
  body.add(belly);

  // 眼睛
  const eyeWhite = candy(0xffffff, { roughness: 0.15, clearcoat: 1 });
  const pupilMat = candy(0x24163a, { roughness: 0.08, clearcoat: 1 });
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.1 * s, 0.63, 0.218);
    eye.rotation.y = 0.38 * s;
    const white = mesh(geo('eyeW', () => new THREE.SphereGeometry(0.078, 20, 14)), eyeWhite);
    white.scale.set(1, 1.18, 0.62);
    const pupil = mesh(geo('pupil', () => new THREE.SphereGeometry(0.05, 18, 12)), pupilMat, 0, -0.008, 0.033);
    pupil.scale.set(1, 1.2, 0.55);
    const hl = mesh(geo('hl', () => new THREE.SphereGeometry(0.017, 10, 8)), hlMat, 0.016, 0.024, 0.062);
    const hl2 = mesh(geo('hl2', () => new THREE.SphereGeometry(0.009, 8, 6)), hlMat, -0.014, -0.022, 0.06);
    eye.add(white, pupil, hl, hl2);
    body.add(eye);
    eyes.push(eye);
  }
  // 腮红
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7aa8, transparent: true, opacity: 0.55, depthWrite: false });
  for (const s of [-1, 1]) {
    const b = mesh(geo('blush', () => new THREE.CircleGeometry(0.042, 20)), blushMat, 0.175 * s, 0.53, 0.209);
    b.rotation.y = Math.atan2(0.175, 0.209) * s;
    b.scale.set(1.3, 0.8, 1);
    body.add(b);
  }
  // 嘴巴
  const mouth = mesh(geo('mouth', () => new THREE.TorusGeometry(0.034, 0.011, 8, 16, Math.PI)), candy(0x5a1a2a), 0, 0.535, 0.266);
  mouth.rotation.z = Math.PI;
  body.add(mouth);

  // 手臂
  const armMat = bodyMat;
  const handMat = candy(lighten(def.color, 0.5));
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.255 * s, 0.53, 0);
    pivot.rotation.z = 0.42 * s;
    const arm = mesh(geo('arm', () => new THREE.CapsuleGeometry(0.058, 0.1, 6, 12)), armMat, 0, -0.09, 0);
    const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.066, 14, 10)), handMat, 0, -0.17, 0);
    pivot.add(arm, hand);
    body.add(pivot);
    arms.push(pivot);
  }
  // 脚
  const footMat = candy(darken(def.color, 0.22), { roughness: 0.45 });
  const feet = [];
  for (const s of [-1, 1]) {
    const f = mesh(geo('foot', () => new THREE.SphereGeometry(0.1, 16, 10)), footMat, 0.12 * s, 0.055, 0.03);
    f.scale.set(1, 0.62, 1.38);
    bob.add(f);
    feet.push(f);
  }

  const hat = makeHat(def);
  hat.group.position.y = 0.86;
  body.add(hat.group);

  shadowAll(root, true, false);
  blushMat && body.children.forEach((c) => { if (c.material === blushMat) c.castShadow = false; });

  return { root, bob, body, torso, eyes, arms, feet, spinner: hat.spinner, bodyMat };
}

function makeHat(def) {
  const g = new THREE.Group();
  let spinner = null;
  const hc = def.hatColor;
  switch (def.hat) {
    case 'bow': {
      const m = candy(hc, { roughness: 0.25 });
      const dot = candy(0xffffff);
      const bow = new THREE.Group();
      for (const s of [-1, 1]) {
        const lobe = mesh(geo('bowLobe', () => new THREE.ConeGeometry(0.085, 0.17, 18)), m, 0.085 * s, 0, 0);
        lobe.rotation.z = (Math.PI / 2) * s;
        lobe.scale.set(1, 1, 0.65);
        bow.add(lobe);
        bow.add(mesh(geo('bowDot', () => new THREE.SphereGeometry(0.017, 8, 6)), dot, 0.12 * s, 0.025, 0.04));
      }
      bow.add(mesh(geo('bowKnot', () => new THREE.SphereGeometry(0.045, 14, 10)), m));
      bow.position.set(0.1, -0.02, 0.05);
      bow.rotation.set(0.3, 0, -0.35);
      g.add(bow);
      break;
    }
    case 'leaf': {
      const stem = mesh(geo('stem', () => new THREE.CylinderGeometry(0.014, 0.022, 0.12, 8)), candy(0x7a5230), 0, 0.04, 0);
      stem.rotation.z = 0.15;
      g.add(stem);
      const lm = candy(hc, { roughness: 0.35 });
      for (const s of [-1, 1]) {
        const leaf = mesh(geo('leaf', () => new THREE.SphereGeometry(0.085, 16, 10)), lm, 0.07 * s, 0.1, 0);
        leaf.scale.set(1, 0.22, 0.5);
        leaf.rotation.z = 0.45 * s;
        g.add(leaf);
      }
      break;
    }
    case 'propeller': {
      const cap = mesh(geo('beanie', () => new THREE.SphereGeometry(0.283, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.6)),
        candy(0xffffff, { map: T.vstripeTex(['#ff5d5d', '#ffd23f', '#4fc3ff', '#6be06b'], 8), roughness: 0.4 }), 0, -0.23, 0);
      g.add(cap);
      const stem = mesh(geo('pstem', () => new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8)), candy(0xdddddd, { metalness: 0.6 }), 0, 0.06, 0);
      g.add(stem);
      spinner = new THREE.Group();
      spinner.position.y = 0.11;
      const bladeM = candy(hc);
      for (const s of [-1, 1]) {
        const b = mesh(geo('blade', () => new RoundedBoxGeometry(0.17, 0.012, 0.055, 2, 0.006)), bladeM, 0.09 * s, 0, 0);
        b.rotation.x = 0.25 * s;
        spinner.add(b);
      }
      spinner.add(mesh(geo('pball', () => new THREE.SphereGeometry(0.025, 10, 8)), candy(0xffd23f)));
      g.add(spinner);
      break;
    }
    case 'ears': {
      const outer = candy(def.color, { roughness: 0.36 });
      const inner = candy(hc, { roughness: 0.5 });
      for (const s of [-1, 1]) {
        const e = new THREE.Group();
        e.position.set(0.14 * s, -0.04, 0);
        e.rotation.z = -0.38 * s;
        const o = mesh(geo('earO', () => new THREE.ConeGeometry(0.085, 0.17, 16)), outer, 0, 0.06, 0);
        const i = mesh(geo('earI', () => new THREE.ConeGeometry(0.05, 0.11, 12)), inner, 0, 0.05, 0.035);
        o.scale.z = 0.6; i.scale.z = 0.4;
        e.add(o, i);
        g.add(e);
      }
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshPhysicalMaterial({ color: hc, metalness: 0.9, roughness: 0.22, clearcoat: 0.6 });
      const band = mesh(geo('crownBand', () => new THREE.CylinderGeometry(0.13, 0.12, 0.06, 20, 1, true)), gold, 0, 0.0, 0);
      band.material.side = THREE.DoubleSide;
      g.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = mesh(geo('spike', () => new THREE.ConeGeometry(0.035, 0.09, 8)), gold, Math.sin(a) * 0.12, 0.07, Math.cos(a) * 0.12);
        g.add(sp);
        g.add(mesh(geo('cball', () => new THREE.SphereGeometry(0.018, 8, 6)), gold, Math.sin(a) * 0.12, 0.12, Math.cos(a) * 0.12));
      }
      const gem = mesh(geo('gem', () => new THREE.OctahedronGeometry(0.03)), candy(0xff3d7f, { roughness: 0.05 }), 0, 0.0, 0.128);
      g.add(gem);
      g.rotation.z = 0.12;
      g.position.x = 0.02;
      break;
    }
    case 'cap': {
      const m = candy(hc, { roughness: 0.5, clearcoat: 0.2 });
      const dome = mesh(geo('capDome', () => new THREE.SphereGeometry(0.284, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.4)), m, 0, -0.22, 0);
      const brim = mesh(geo('brim', () => new THREE.CylinderGeometry(0.17, 0.17, 0.022, 24, 1, false, -Math.PI / 2, Math.PI)), m, 0, -0.105, 0.2);
      brim.scale.z = 1.1;
      brim.rotation.x = 0.12;
      const btn = mesh(geo('capBtn', () => new THREE.SphereGeometry(0.03, 10, 8)), candy(0xffffff), 0, 0.05, 0);
      g.add(dome, brim, btn);
      break;
    }
  }
  return { group: g, spinner };
}

// 困住角色的大泡泡
export function makeTrapBubble() {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xd8f6ff, transparent: true, opacity: 0.32, roughness: 0.02, metalness: 0,
    iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [150, 600],
    clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  });
  const s = mesh(geo('trapBubble', () => new THREE.SphereGeometry(0.58, 40, 28)), m, 0, 0.5, 0);
  s.renderOrder = 5;
  const hl = mesh(geo('bubbleHl', () => new THREE.SphereGeometry(0.1, 12, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), -0.22, 0.82, 0.38);
  hl.scale.set(1.3, 0.7, 0.4);
  hl.rotation.z = 0.6;
  g.add(s, hl);
  return { group: g, mat: m, sphere: s };
}

// 护盾：环绕的糖粒
export function makeShieldOrb() {
  const g = new THREE.Group();
  const cols = [0xff6f9f, 0xffd23f, 0x52e0b8, 0x6c9dff, 0xb07cff, 0xff9a3c];
  cols.forEach((c, i) => {
    const a = (i / cols.length) * Math.PI * 2;
    const o = mesh(geo('orb', () => new THREE.SphereGeometry(0.06, 12, 8)), candy(c, { emissive: c, emissiveIntensity: 0.35 }), Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5);
    g.add(o);
  });
  return g;
}

/* ======================== 糖果泡泡（炸弹） ======================== */
export function makeBomb(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const lc = lighten(color, 0.6);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: T.stripeTex(color, lc, 5, 0.6), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: 0xff2040, emissiveIntensity: 0,
  });
  const ball = mesh(geo('bombBall', () => new THREE.SphereGeometry(0.33, 36, 24)), mat, 0, 0.36, 0);
  inner.add(ball);
  // 气球结 + 糖纸
  const knotM = candy(color, { roughness: 0.25 });
  const knot = mesh(geo('knot', () => new THREE.CylinderGeometry(0.035, 0.07, 0.08, 14)), knotM, 0, 0.71, 0);
  inner.add(knot);
  for (const s of [-1, 1]) {
    const w = mesh(geo('wrap', () => new THREE.ConeGeometry(0.06, 0.12, 12)), knotM, 0.06 * s, 0.78, 0);
    w.rotation.z = (Math.PI / 2 + 0.5) * -s;
    inner.add(w);
  }
  // 引线火花
  const spark = mesh(geo('spark', () => new THREE.SphereGeometry(0.04, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 0.82, 0);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowTex(), color: 0xffd36b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.set(0.35, 0.35, 1);
  spark.add(glow);
  inner.add(spark);
  // 小脸
  const eyeM = candy(0x2a1a3a, { roughness: 0.1 });
  for (const s of [-1, 1]) {
    const e = mesh(geo('bEye', () => new THREE.CapsuleGeometry(0.022, 0.03, 4, 8)), eyeM, 0.09 * s, 0.4, 0.31);
    e.rotation.x = -0.2;
    inner.add(e);
  }
  const bm = new THREE.MeshBasicMaterial({ color: 0xff6f9f, transparent: true, opacity: 0.6, depthWrite: false });
  for (const s of [-1, 1]) {
    const b = mesh(geo('bBlush', () => new THREE.CircleGeometry(0.035, 14)), bm, 0.16 * s, 0.33, 0.285);
    b.rotation.y = 0.5 * s;
    inner.add(b);
  }
  shadowAll(g, true, false);
  spark.castShadow = false;
  return { group: g, inner, mat, spark, glow };
}

/* ======================== 水柱（爆炸） ======================== */
const flameOuterMat = new THREE.MeshStandardMaterial({
  color: 0x55ccff, emissive: 0x1e9bff, emissiveIntensity: 1.25, transparent: true, opacity: 0.82, roughness: 0.1, depthWrite: false,
});
const flameCoreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.85, 2.1), transparent: true, opacity: 0.95 });
export function makeFlame(kind) {
  const g = new THREE.Group();
  if (kind === 'c') {
    g.add(mesh(geo('flC', () => new THREE.SphereGeometry(0.44, 28, 18)), flameOuterMat, 0, 0.42, 0));
    g.add(mesh(geo('flCc', () => new THREE.SphereGeometry(0.27, 20, 14)), flameCoreMat, 0, 0.42, 0));
  } else {
    const o = mesh(geo('flS', () => new THREE.CapsuleGeometry(0.3, 0.46, 8, 16).rotateZ(Math.PI / 2)), flameOuterMat, 0, 0.36, 0);
    const c = mesh(geo('flSc', () => new THREE.CapsuleGeometry(0.15, 0.62, 6, 12).rotateZ(Math.PI / 2)), flameCoreMat, 0, 0.36, 0);
    g.add(o, c);
    if (kind === 'z') g.rotation.y = Math.PI / 2;
  }
  g.children.forEach((m) => { m.renderOrder = 3; });
  return g;
}

/* ======================== 可破坏方块 ======================== */
const SOFT_COLORS = [0xff8fb8, 0x8fd9ff, 0xffd36b, 0xb79cff, 0x8ff0c6, 0xffa77a];
export function softPalette(i) { return SOFT_COLORS[i % SOFT_COLORS.length]; }

export function makeSoftBlock(variant, color) {
  const g = new THREE.Group();
  switch (variant) {
    case 'gift': {
      g.add(mesh(geo('giftBox', () => new RoundedBoxGeometry(0.84, 0.74, 0.84, 3, 0.07)), candy(color, { roughness: 0.4, clearcoat: 0.4 }), 0, 0.37, 0));
      const rib = candy(0xffffff, { roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(0xfff0f6) });
      g.add(mesh(geo('ribA', () => new THREE.BoxGeometry(0.86, 0.76, 0.14)), rib, 0, 0.37, 0));
      g.add(mesh(geo('ribB', () => new THREE.BoxGeometry(0.14, 0.76, 0.86)), rib, 0, 0.37, 0));
      for (const s of [-1, 1]) {
        const loop = mesh(geo('bowLoop', () => new THREE.TorusGeometry(0.1, 0.035, 8, 18)), rib, 0.1 * s, 0.82, 0);
        loop.rotation.set(Math.PI / 2 - 0.5, 0, 0.35 * s);
        loop.scale.set(1, 0.7, 1);
        g.add(loop);
      }
      g.add(mesh(geo('bowCtr', () => new THREE.SphereGeometry(0.055, 12, 8)), rib, 0, 0.77, 0));
      break;
    }
    case 'jelly': {
      const jm = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.86, sheen: 0.4, sheenColor: new THREE.Color(0xffffff),
        emissive: color, emissiveIntensity: 0.08,
      });
      g.add(mesh(geo('jellyBox', () => new RoundedBoxGeometry(0.82, 0.72, 0.82, 5, 0.17)), jm, 0, 0.36, 0));
      // 顶部奶油 + 樱桃
      g.add(mesh(geo('cream', () => new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), candy(0xfffaf2, { roughness: 0.6 }), 0, 0.7, 0));
      g.add(mesh(geo('cherry', () => new THREE.SphereGeometry(0.075, 16, 12)), candy(0xe8173e, { roughness: 0.1 }), 0, 0.88, 0));
      const stem = mesh(geo('cherryStem', () => new THREE.CylinderGeometry(0.008, 0.01, 0.12, 6)), candy(0x4b7a2a), 0.02, 0.97, 0);
      stem.rotation.z = -0.4;
      g.add(stem);
      break;
    }
    case 'choco': {
      const cm = candy(0x7b4422, { roughness: 0.35, clearcoat: 0.5 });
      const cm2 = candy(0x8e5330, { roughness: 0.32, clearcoat: 0.6 });
      g.add(mesh(geo('chocoBase', () => new RoundedBoxGeometry(0.84, 0.5, 0.84, 3, 0.05)), cm, 0, 0.25, 0));
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        g.add(mesh(geo('chocoBit', () => new RoundedBoxGeometry(0.36, 0.2, 0.36, 3, 0.06)), cm2, -0.2 + i * 0.4, 0.56, -0.2 + j * 0.4));
      }
      // 彩色糖衣豆
      for (let i = 0; i < 4; i++) {
        const b = mesh(geo('mnm', () => new THREE.SphereGeometry(0.055, 12, 8)), candy(SOFT_COLORS[(i + 1) % 6]), -0.2 + (i % 2) * 0.4, 0.68, -0.2 + ((i / 2) | 0) * 0.4);
        b.scale.y = 0.55;
        g.add(b);
      }
      break;
    }
    case 'waffle': {
      const wm = new THREE.MeshStandardMaterial({ map: T.waferTex('#ebb766', '#c98a3a'), roughness: 0.7 });
      g.add(mesh(geo('waffle', () => new RoundedBoxGeometry(0.84, 0.56, 0.84, 3, 0.08)), wm, 0, 0.28, 0));
      g.add(mesh(geo('syrup', () => new RoundedBoxGeometry(0.7, 0.05, 0.7, 2, 0.025)), candy(color, { roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }), 0, 0.575, 0));
      const butter = mesh(geo('butter', () => new RoundedBoxGeometry(0.22, 0.14, 0.22, 2, 0.035)), candy(0xfff1a8, { roughness: 0.4 }), 0.05, 0.66, -0.03);
      butter.rotation.y = 0.5;
      g.add(butter);
      g.add(mesh(geo('cherry', () => new THREE.SphereGeometry(0.075, 16, 12)), candy(0xe8173e, { roughness: 0.1 }), -0.22, 0.65, 0.2));
      break;
    }
    case 'cookie': {
      const ck = new THREE.MeshStandardMaterial({ map: T.cookieTex(), roughness: 0.85 });
      g.add(mesh(geo('cookie', () => new THREE.CylinderGeometry(0.42, 0.42, 0.2, 28)), ck, 0, 0.1, 0));
      g.add(mesh(geo('cookieCream', () => new THREE.CylinderGeometry(0.39, 0.39, 0.12, 28)), candy(color, { roughness: 0.6, clearcoat: 0.1 }), 0, 0.26, 0));
      g.add(mesh(geo('cookie', () => new THREE.CylinderGeometry(0.42, 0.42, 0.2, 28)), ck, 0, 0.42, 0));
      g.add(mesh(geo('cookieCream', () => new THREE.CylinderGeometry(0.39, 0.39, 0.12, 28)), candy(0xfff6ea, { roughness: 0.6 }), 0, 0.58, 0));
      g.add(mesh(geo('cookie', () => new THREE.CylinderGeometry(0.42, 0.42, 0.2, 28)), ck, 0, 0.74, 0));
      break;
    }
  }
  return bake(g);
}

/* ======================== 不可破坏柱子 ======================== */
export function makeHardBlock(variant, seed = 0) {
  const g = new THREE.Group();
  switch (variant) {
    case 'cane': {
      const stripes = T.stripeTex('#ffffff', seed % 2 ? '#ff3b5c' : '#2ec4a6', 4, 0.5);
      g.add(mesh(geo('caneCol', () => new THREE.CylinderGeometry(0.36, 0.4, 0.9, 28)), candy(0xffffff, { map: stripes, roughness: 0.15, clearcoat: 1 }), 0, 0.45, 0));
      g.add(mesh(geo('caneTop', () => new THREE.SphereGeometry(0.36, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), candy(0xffffff, { map: stripes, roughness: 0.15, clearcoat: 1 }), 0, 0.9, 0));
      g.add(mesh(geo('caneRing', () => new THREE.TorusGeometry(0.4, 0.06, 10, 28).rotateX(Math.PI / 2)), candy(0xffd23f, { metalness: 0.3, roughness: 0.3 }), 0, 0.06, 0));
      g.add(mesh(geo('caneBall', () => new THREE.SphereGeometry(0.09, 14, 10)), candy(0xffd23f, { metalness: 0.3, roughness: 0.25 }), 0, 1.28, 0));
      break;
    }
    case 'cupcake': {
      const cupCol = [['#ff9ec4', '#ffd0e2'], ['#9ed8ff', '#d4eeff'], ['#ffe08a', '#fff2c4']][seed % 3];
      g.add(mesh(geo('cup', () => new THREE.CylinderGeometry(0.42, 0.32, 0.46, 24)), matte(0xffffff, { map: T.vstripeTex(cupCol, 16), roughness: 0.6 }), 0, 0.23, 0));
      const fr = candy([0xfff3f8, 0xffc4dd, 0xc9f2e4][seed % 3], { roughness: 0.5, clearcoat: 0.3 });
      g.add(mesh(geo('fr1', () => new THREE.TorusGeometry(0.33, 0.13, 14, 28).rotateX(Math.PI / 2)), fr, 0, 0.52, 0));
      g.add(mesh(geo('fr2', () => new THREE.TorusGeometry(0.22, 0.12, 14, 24).rotateX(Math.PI / 2)), fr, 0, 0.68, 0));
      g.add(mesh(geo('fr3', () => new THREE.SphereGeometry(0.17, 18, 12)), fr, 0, 0.82, 0));
      g.add(mesh(geo('frC', () => new THREE.CylinderGeometry(0.34, 0.34, 0.14, 24)), fr, 0, 0.52, 0));
      g.add(mesh(geo('cherry', () => new THREE.SphereGeometry(0.075, 16, 12)), candy(0xe8173e, { roughness: 0.1 }), 0, 1.02, 0));
      const stem = mesh(geo('cherryStem', () => new THREE.CylinderGeometry(0.008, 0.01, 0.12, 6)), candy(0x4b7a2a), 0.02, 1.11, 0);
      stem.rotation.z = -0.4;
      g.add(stem);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4, rr = 0.15 + (i % 3) * 0.07;
        const sp = mesh(geo('sprinkle', () => new THREE.CapsuleGeometry(0.014, 0.05, 3, 6)), candy(SOFT_COLORS[i % 6]), Math.cos(a) * rr, 0.66 + (i % 3) * 0.05 + (rr < 0.2 ? 0.12 : 0), Math.sin(a) * rr);
        sp.rotation.set(a, a * 1.3, 1.2);
        g.add(sp);
      }
      break;
    }
    case 'macaron': {
      const cols = [0xffb3cf, 0xb8f0d8, 0xd7c2ff, 0xffe4a0];
      for (let i = 0; i < 3; i++) {
        const c = cols[(seed + i) % 4];
        const y = 0.16 + i * 0.3;
        const shell = candy(c, { roughness: 0.55, clearcoat: 0.2 });
        const top = mesh(geo('macShell', () => new THREE.SphereGeometry(0.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), shell, 0, y + 0.03, 0);
        top.scale.y = 0.32;
        const bot = mesh(geo('macShell', () => new THREE.SphereGeometry(0.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), shell, 0, y - 0.03, 0);
        bot.scale.y = -0.32;
        const foot = mesh(geo('macFoot', () => new THREE.CylinderGeometry(0.4, 0.4, 0.05, 28)), shell, 0, y, 0);
        const cream = mesh(geo('macCream', () => new THREE.CylinderGeometry(0.37, 0.37, 0.06, 28)), candy(0xfffaf0, { roughness: 0.6 }), 0, y, 0);
        foot.scale.set(0.98, 1, 0.98);
        g.add(top, bot, cream);
        top.position.y = y + 0.04; bot.position.y = y - 0.04;
      }
      break;
    }
    case 'gumdrop': {
      const c = [0xff7eb6, 0x7ed6ff, 0xa58bff, 0x7ef0b8][seed % 4];
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const r = 0.42 * Math.cos(t * Math.PI / 2) ** 0.6;
        pts.push(new THREE.Vector2(Math.max(0.001, r), t * 0.95));
      }
      const gm = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.75, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.3, clearcoat: 0.3 });
      g.add(mesh(geo('gumdrop', () => new THREE.LatheGeometry(pts, 28)), gm, 0, 0, 0));
      // 糖霜颗粒
      for (let i = 0; i < 12; i++) {
        const a = i * 2.1, h = 0.1 + (i % 6) * 0.13;
        const rr = 0.42 * Math.cos((h / 0.95) * Math.PI / 2) ** 0.6;
        g.add(mesh(geo('sugar', () => new THREE.BoxGeometry(0.035, 0.035, 0.035)), candy(0xffffff, { roughness: 0.2 }), Math.cos(a) * rr, h, Math.sin(a) * rr));
      }
      break;
    }
  }
  return bake(g);
}

/* ======================== 道具 ======================== */
export function makeItem(type) {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  g.add(holder);
  const m = new THREE.Group();
  holder.add(m);
  switch (type) {
    case 'bomb': {
      m.add(mesh(geo('iBomb', () => new THREE.SphereGeometry(0.14, 20, 14)), candy(0xffffff, { map: T.stripeTex(0xff6f9f, 0xffd0e2, 5, 0.6), roughness: 0.1, clearcoat: 1 })));
      m.add(mesh(geo('iKnot', () => new THREE.ConeGeometry(0.04, 0.07, 10)), candy(0xff6f9f), 0, 0.15, 0));
      const sp = mesh(geo('spark', () => new THREE.SphereGeometry(0.04, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 0.2, 0);
      sp.scale.setScalar(0.7);
      m.add(sp);
      break;
    }
    case 'potion':
    case 'max': {
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0, clearcoat: 1, depthWrite: false });
      const liquidC = type === 'max' ? 0xff3355 : 0x3ab8ff;
      m.add(mesh(geo('flask', () => new THREE.SphereGeometry(0.13, 20, 14)), glass, 0, -0.03, 0));
      m.add(mesh(geo('liquid', () => new THREE.SphereGeometry(0.105, 18, 12)), candy(liquidC, { emissive: liquidC, emissiveIntensity: 0.45, roughness: 0.1 }), 0, -0.04, 0));
      m.add(mesh(geo('neck', () => new THREE.CylinderGeometry(0.045, 0.05, 0.1, 12)), glass, 0, 0.12, 0));
      m.add(mesh(geo('cork', () => new THREE.CylinderGeometry(0.05, 0.043, 0.06, 12)), matte(0xb07a45), 0, 0.19, 0));
      if (type === 'max') {
        const star = mesh(geo('star', () => new THREE.OctahedronGeometry(0.06)), candy(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 0.6, metalness: 0.4 }), 0, 0.27, 0);
        m.add(star);
      }
      break;
    }
    case 'skate': {
      const bootM = candy(0xffd23f, { roughness: 0.3 });
      m.add(mesh(geo('boot', () => new RoundedBoxGeometry(0.14, 0.09, 0.24, 2, 0.04)), bootM, 0, -0.03, 0));
      m.add(mesh(geo('bootUp', () => new RoundedBoxGeometry(0.13, 0.15, 0.12, 2, 0.04)), bootM, 0, 0.08, -0.05));
      m.add(mesh(geo('bootLace', () => new THREE.BoxGeometry(0.135, 0.02, 0.1)), candy(0xffffff), 0, 0.08, 0.02));
      for (const z of [-0.08, 0.08]) for (const x of [-0.06, 0.06]) {
        const w = mesh(geo('wheel', () => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateZ(Math.PI / 2)), candy(0xff5fa2), x, -0.1, z);
        m.add(w);
      }
      m.rotation.y = 0.6;
      break;
    }
    case 'needle': {
      const metal = new THREE.MeshPhysicalMaterial({ color: 0xe6edf5, metalness: 1, roughness: 0.15 });
      const shaft = mesh(geo('needle', () => new THREE.CylinderGeometry(0.012, 0.002, 0.32, 8)), metal, 0, -0.04, 0);
      m.add(shaft);
      m.add(mesh(geo('pinHead', () => new THREE.SphereGeometry(0.06, 16, 12)), candy(0xff3b5c, { roughness: 0.1 }), 0, 0.14, 0));
      m.rotation.z = 0.6;
      break;
    }
    case 'kick': {
      const sm = candy(0x6be06b, { roughness: 0.35 });
      m.add(mesh(geo('shoe', () => new RoundedBoxGeometry(0.15, 0.1, 0.26, 2, 0.045)), sm, 0, -0.04, 0.02));
      m.add(mesh(geo('shoeUp', () => new RoundedBoxGeometry(0.14, 0.12, 0.13, 2, 0.05)), sm, 0, 0.06, -0.05));
      m.add(mesh(geo('sole', () => new RoundedBoxGeometry(0.16, 0.03, 0.27, 2, 0.012)), candy(0xffffff), 0, -0.095, 0.02));
      m.add(mesh(geo('star', () => new THREE.OctahedronGeometry(0.06)), candy(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: 0.4 }), 0.08, 0.0, 0.02));
      m.rotation.y = -0.6;
      break;
    }
    case 'shield': {
      const hm = candy(0xff5fa2, { roughness: 0.1, emissive: 0xff2a7a, emissiveIntensity: 0.25 });
      for (const s of [-1, 1]) m.add(mesh(geo('heartLobe', () => new THREE.SphereGeometry(0.085, 18, 12)), hm, 0.06 * s, 0.05, 0));
      const tip = mesh(geo('heartTip', () => new THREE.ConeGeometry(0.115, 0.17, 18)), hm, 0, -0.06, 0);
      tip.rotation.z = Math.PI;
      tip.scale.z = 0.72;
      m.children.forEach((c) => { if (c !== tip) c.scale.z = 0.72; });
      m.add(tip);
      break;
    }
  }
  m.scale.setScalar(1.5);
  // 外层泡泡
  const bubble = mesh(geo('itemBubble', () => new THREE.SphereGeometry(0.37, 32, 22)), new THREE.MeshPhysicalMaterial({
    color: 0xe8fbff, transparent: true, opacity: 0.14, roughness: 0, iridescence: 1, iridescenceIOR: 1.3, clearcoat: 1, depthWrite: false,
  }));
  bubble.renderOrder = 4;
  holder.add(bubble);
  const hl = mesh(geo('ibHl', () => new THREE.SphereGeometry(0.05, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), -0.14, 0.19, 0.26);
  hl.scale.set(1.3, 0.7, 0.4);
  holder.add(hl);
  shadowAll(m, true, false);
  bubble.castShadow = true;
  return { group: g, holder, model: m };
}

/* ======================== 装饰物 ======================== */
export function makeLollipop(c1, c2, h = 3) {
  const g = new THREE.Group();
  g.add(mesh(geo(`lolStick${h}`, () => new THREE.CylinderGeometry(0.08, 0.08, h, 10)), matte(0xfffaf0, { roughness: 0.5 }), 0, h / 2, 0));
  const disc = mesh(geo('lolDisc', () => new THREE.CylinderGeometry(0.9, 0.9, 0.28, 36).rotateX(Math.PI / 2)), [
    candy(c1, { roughness: 0.2 }), candy(0xffffff, { map: T.swirlTex(c1, c2), roughness: 0.15, clearcoat: 1 }), candy(0xffffff, { map: T.swirlTex(c1, c2), roughness: 0.15, clearcoat: 1 }),
  ], 0, h + 0.7, 0);
  g.add(disc);
  return g;
}

export function makeDonut(icing) {
  const g = new THREE.Group();
  g.add(mesh(geo('donut', () => new THREE.TorusGeometry(0.6, 0.3, 18, 36).rotateX(Math.PI / 2)), candy(0xe2a35a, { roughness: 0.7, clearcoat: 0 }), 0, 0.3, 0));
  const ic = mesh(geo('icing', () => new THREE.TorusGeometry(0.6, 0.27, 16, 36, Math.PI * 2).rotateX(Math.PI / 2)), candy(icing, { roughness: 0.25, clearcoat: 0.8 }), 0, 0.38, 0);
  ic.scale.y = 0.8;
  g.add(ic);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
    const rr = 0.6 + (Math.random() - 0.5) * 0.3;
    const s = mesh(geo('dsprinkle', () => new THREE.CapsuleGeometry(0.025, 0.08, 3, 6)), candy(SOFT_COLORS[i % 6]), Math.cos(a) * rr, 0.62, Math.sin(a) * rr);
    s.rotation.set(Math.PI / 2, 0, Math.random() * 3);
    g.add(s);
  }
  return g;
}

export function makeIceCream(c) {
  const g = new THREE.Group();
  const cone = mesh(geo('icCone', () => new THREE.ConeGeometry(0.45, 1.5, 20).rotateX(Math.PI)), matte(0xdca35c, { map: T.waferTex('#dca35c', '#b97c35') }), 0, 0.75, 0);
  g.add(cone);
  g.add(mesh(geo('scoop', () => new THREE.SphereGeometry(0.55, 24, 16)), candy(c, { roughness: 0.55, clearcoat: 0.2 }), 0, 1.75, 0));
  g.add(mesh(geo('scoop2', () => new THREE.SphereGeometry(0.42, 24, 16)), candy(0xfff3e6, { roughness: 0.55 }), 0.05, 2.35, 0.02));
  const ch = mesh(geo('bigCherry', () => new THREE.SphereGeometry(0.13, 16, 12)), candy(0xe8173e, { roughness: 0.1 }), 0, 2.82, 0);
  g.add(ch);
  return g;
}

export function makeGumdropHill(c, s = 1) {
  const g = new THREE.Group();
  const d = mesh(geo('hill', () => new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xffffff) }), 0, 0, 0);
  d.scale.set(1.4 * s, 1.1 * s, 1.4 * s);
  g.add(d);
  return g;
}

export function makeCandyCane(c = 0xff3b5c, h = 3) {
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)));
  const arc = new THREE.EllipseCurve(0.5, h, 0.5, 0.5, Math.PI, 0, true);
  const pts = arc.getPoints(16).map((p) => new THREE.Vector3(p.x, p.y, 0));
  path.add(new THREE.CatmullRomCurve3(pts));
  const tube = new THREE.TubeGeometry(path, 64, 0.18, 14, false);
  const t = T.stripeTex('#ffffff', c, 3, 0.25).clone();
  t.repeat.set(10, 1);
  t.needsUpdate = true;
  const m = mesh(tube, candy(0xffffff, { map: t, roughness: 0.15, clearcoat: 1 }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeCloud() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff0f6, emissiveIntensity: 0.25 });
  const n = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const s = 0.6 + Math.random() * 0.7;
    const o = mesh(geo('cloudBall', () => new THREE.SphereGeometry(1, 18, 12)), m, (i - n / 2) * 0.8, Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
    o.scale.set(s, s * 0.8, s);
    g.add(o);
  }
  return g;
}

// 突然死亡掉落的糖块
export function makeDropBlock(color) {
  const g = new THREE.Group();
  g.add(mesh(geo('dropBox', () => new RoundedBoxGeometry(0.94, 0.9, 0.94, 4, 0.14)), new THREE.MeshPhysicalMaterial({
    color, roughness: 0.15, clearcoat: 1, sheen: 0.5, sheenColor: new THREE.Color(0xffffff),
  }), 0, 0.45, 0));
  g.add(mesh(geo('dropStripe', () => new THREE.BoxGeometry(0.96, 0.18, 0.96)), candy(0xffffff, { roughness: 0.3 }), 0, 0.45, 0));
  shadowAll(g);
  return g;
}

export { lighten, darken };
