// 场景环境：天空、灯光、蛋糕平台、地板、围栏、周边装饰
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { W, H } from './constants.js';
import * as M from './models.js';
import * as T from './textures.js';

export function setupLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff4fa, 0xb8c8ff, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1de, 2.4);
  sun.position.set(-6, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 50;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd6e8ff, 0.6);
  fill.position.set(8, 6, -6);
  scene.add(fill);
  return { hemi, sun, fill };
}

function makeSky(colors) {
  const g = new THREE.SphereGeometry(220, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(colors[0]) },
      mid: { value: new THREE.Color(colors[1]) },
      bot: { value: new THREE.Color(colors[2]) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bot, smoothstep(0.0, 0.3, -h));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(g, m);
}

// 构建与地图相关的整套关卡外观
export function buildWorld(scene, map) {
  const root = new THREE.Group();
  root.name = 'world';

  root.add(makeSky(map.sky));
  scene.fog = new THREE.Fog(new THREE.Color(map.sky[1]), 40, 120);

  // 远处地面
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.groundTex(map.ground), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.6;
  ground.receiveShadow = true;
  root.add(ground);

  // 蛋糕平台（三层）
  const cakeW = W + 3, cakeD = H + 3;
  const cake = new THREE.Group();
  const layers = [
    { h: 0.55, y: -1.33, c: 0xf5d7a1, inset: 0 },
    { h: 0.18, y: -0.97, c: 0xff9ec4, inset: 0.02 },
    { h: 0.55, y: -0.6, c: 0xf5d7a1, inset: 0 },
    { h: 0.32, y: -0.17, c: 0xfffaf3, inset: -0.04 },
  ];
  for (const L of layers) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(cakeW - L.inset * 2, L.h, cakeD - L.inset * 2, 4, Math.min(0.08, L.h / 2.2)),
      M.candy(L.c, { roughness: L.c === 0xf5d7a1 ? 0.85 : 0.45, clearcoat: L.c === 0xf5d7a1 ? 0 : 0.4 }));
    m.position.y = L.y;
    cake.add(m);
  }
  // 奶油滴落
  const dripM = M.candy(0xfffaf3, { roughness: 0.45, clearcoat: 0.4 });
  const per = 2 * (cakeW + cakeD);
  const nDrips = Math.round(per / 0.45);
  for (let i = 0; i < nDrips; i++) {
    let d = (i / nDrips) * per, x, z, rot = 0;
    const hw = cakeW / 2 + 0.035, hd = cakeD / 2 + 0.035;
    if (d < cakeW) { x = -cakeW / 2 + d; z = hd; }
    else if ((d -= cakeW) < cakeD) { x = hw; z = cakeD / 2 - d; rot = 1; }
    else if ((d -= cakeD) < cakeW) { x = cakeW / 2 - d; z = -hd; }
    else { d -= cakeW; x = -hw; z = -cakeD / 2 + d; rot = 1; }
    const len = 0.12 + Math.random() * 0.4;
    const drip = new THREE.Mesh(M.geo('drip', () => new THREE.CapsuleGeometry(0.11, 1, 4, 10)), dripM);
    drip.scale.set(1, len, rot ? 1 : 0.5);
    if (rot) drip.scale.set(0.5, len, 1);
    drip.position.set(x, -0.3 - len / 2, z);
    cake.add(drip);
  }
  // 顶部边缘的奶油花
  const rosettes = [0xff9ec4, 0xfffaf3];
  for (let i = 0; i < 40; i++) {
    const d = (i / 40) * per;
    let x, z, dd = d;
    if (dd < cakeW) { x = -cakeW / 2 + dd; z = cakeD / 2 - 0.35; }
    else if ((dd -= cakeW) < cakeD) { x = cakeW / 2 - 0.35; z = cakeD / 2 - dd; }
    else if ((dd -= cakeD) < cakeW) { x = cakeW / 2 - dd; z = -cakeD / 2 + 0.35; }
    else { dd -= cakeW; x = -cakeW / 2 + 0.35; z = -cakeD / 2 + dd; }
    const r = new THREE.Mesh(M.geo('rosette', () => new THREE.ConeGeometry(0.2, 0.3, 8)), M.candy(rosettes[i % 2], { roughness: 0.5 }));
    r.position.set(x, 0.12, z);
    r.rotation.y = i;
    cake.add(r);
  }
  root.add(M.bake(cake));

  // 地板
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhysicalMaterial({
    map: T.floorTex(map.floorA, map.floorB, map.grout, W, H), roughness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.4,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  floor.receiveShadow = true;
  root.add(floor);

  // 围栏：威化饼 + 巧克力
  const fence = new THREE.Group();
  const waferA = M.matte(0xffffff, { map: T.waferTex('#f4c97a', '#d9a24c'), roughness: 0.8 });
  const waferB = M.matte(0xffffff, { map: T.waferTex('#ffb3cf', '#f08ab0'), roughness: 0.8 });
  const choco = M.candy(0x6b3a1e, { roughness: 0.35, clearcoat: 0.5 });
  for (let c = -1; c <= W; c++) {
    for (let r = -1; r <= H; r++) {
      if (c >= 0 && c < W && r >= 0 && r < H) continue;
      const x = c - (W - 1) / 2, z = r - (H - 1) / 2;
      const corner = (c === -1 || c === W) && (r === -1 || r === H);
      if (corner) {
        const b = new THREE.Mesh(M.geo('fenceCorner', () => new RoundedBoxGeometry(1, 1.05, 1, 3, 0.12)), choco);
        b.position.set(x, 0.52, z);
        fence.add(b);
        const top = new THREE.Mesh(M.geo('cornerTop', () => new THREE.SphereGeometry(0.32, 20, 14)), M.candy(0xff5d8f, { roughness: 0.15, clearcoat: 1 }));
        top.position.set(x, 1.25, z);
        fence.add(top);
      } else {
        const b = new THREE.Mesh(M.geo('fenceBlock', () => new RoundedBoxGeometry(0.98, 0.62, 0.98, 2, 0.06)), (c + r) % 2 ? waferA : waferB);
        b.position.set(x, 0.31, z);
        fence.add(b);
        if ((c + r) % 4 === 0) {
          const cap = new THREE.Mesh(M.geo('fenceCap', () => new RoundedBoxGeometry(1.0, 0.12, 1.0, 2, 0.05)), choco);
          cap.position.set(x, 0.66, z);
          fence.add(cap);
        }
      }
    }
  }
  root.add(M.bake(fence));

  // 周边装饰
  const decor = new THREE.Group();
  const placeRing = (fn, n, rMin, rMax, yBase = -1.6) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const rr = rMin + Math.random() * (rMax - rMin);
      const o = fn(i);
      o.position.set(Math.cos(a) * rr * 1.25, yBase, Math.sin(a) * rr);
      o.rotation.y = Math.random() * Math.PI * 2;
      decor.add(o);
    }
  };
  const cols = [0xff6f9f, 0xffd23f, 0x52e0b8, 0x6c9dff, 0xb07cff, 0xff9a3c];
  placeRing((i) => {
    const l = M.makeLollipop(cols[i % 6], 0xffffff, 2.6 + Math.random() * 2);
    l.scale.setScalar(1 + Math.random() * 0.5);
    return l;
  }, 10, 13, 18);
  placeRing((i) => {
    const d = M.makeDonut([0xff9ec4, 0x7b4422, 0xfff3f8, 0xb79cff][i % 4]);
    d.scale.setScalar(1.6 + Math.random() * 0.6);
    return d;
  }, 8, 12.5, 16);
  placeRing((i) => M.makeGumdropHill(cols[(i + 2) % 6], 1 + Math.random() * 1.5), 14, 16, 26);
  if (map.id === 'ice') {
    placeRing((i) => { const ic = M.makeIceCream(cols[i % 6]); ic.scale.setScalar(1.6); return ic; }, 8, 14, 19);
  } else {
    placeRing((i) => { const cc = M.makeCandyCane([0xff3b5c, 0x2ec4a6, 0x6c9dff][i % 3], 3 + Math.random() * 2); cc.scale.setScalar(1.2); return cc; }, 7, 13, 17);
  }
  M.shadowAll(decor, true, true);
  root.add(decor);

  // 云朵
  const clouds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const c = M.makeCloud();
    const a = (i / 9) * Math.PI * 2;
    c.position.set(Math.cos(a) * 34, 7 + Math.random() * 6, Math.sin(a) * 30 - 6);
    c.scale.setScalar(1.5 + Math.random() * 1.5);
    c.userData.speed = 0.3 + Math.random() * 0.4;
    clouds.add(c);
  }
  root.add(clouds);
  root.userData.clouds = clouds;

  scene.add(root);
  return root;
}

export function animateWorld(world, dt, t) {
  const clouds = world.userData.clouds;
  if (!clouds) return;
  clouds.children.forEach((c, i) => {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 45) c.position.x = -45;
    c.position.y += Math.sin(t * 0.5 + i) * 0.002;
  });
}
