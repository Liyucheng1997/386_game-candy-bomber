import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHARACTERS, W, H } from './constants.js';
import { setupLights } from './world.js';
import { Particles } from './particles.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { UI, itemLegendHTML } from './ui.js';
import { Game } from './game.js';
import * as M from './models.js';

/* ---------- 渲染器 ---------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
setupLights(scene);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 18, 14);

const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.45, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- 系统 ---------- */
const sound = new Sound();
const input = new Input();
const ui = new UI();
const fx = new Particles(scene);
const game = new Game({ scene, camera, sound, fx, ui, input });

/* ---------- 角色头像（离屏渲染） ---------- */
function renderPortraits() {
  const size = 160;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.toneMapping = THREE.NeutralToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.6;
  s.add(new THREE.HemisphereLight(0xffffff, 0xffd6ec, 1.4));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(-1, 2, 3);
  s.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  cam.position.set(0.35, 0.85, 2.1);
  cam.lookAt(0, 0.62, 0);
  const out = CHARACTERS.map((def) => {
    const bean = M.makeBean(def);
    bean.root.rotation.y = -0.35;
    bean.arms[0].rotation.z = -0.9;
    bean.arms[1].rotation.z = 2.3;
    s.add(bean.root);
    r.render(s, cam);
    const url = r.domElement.toDataURL('image/png');
    s.remove(bean.root);
    return url;
  });
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
const portraits = renderPortraits();
ui.setPortraits(portraits);

/* ---------- 菜单 ---------- */
const opts = { mode: 'ffa', humans: 1, ai: 3, difficulty: 'normal', map: 0, wins: 2, chars: [0, 3] };

function buildCharLists() {
  document.querySelectorAll('.char-row').forEach((row) => {
    const pi = +row.dataset.player;
    const list = row.querySelector('.char-list');
    list.innerHTML = '';
    CHARACTERS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'char-btn';
      b.title = c.name;
      b.innerHTML = `<img src="${portraits[i]}" alt="${c.name}">`;
      b.onclick = () => { sound.init(); sound.click(); opts.chars[pi] = i; refreshMenu(); };
      list.appendChild(b);
    });
  });
}

function refreshMenu() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.opt;
    const map = { mode: 'mode', humans: 'humans', ai: 'ai', difficulty: 'difficulty', map: 'map', wins: 'wins' };
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(opts[map[key]]) === b.dataset.v));
  });
  // 电脑数量
  const aiSeg = document.querySelector('[data-opt="ai"]');
  const maxAi = 4 - opts.humans;
  const minAi = opts.humans === 1 ? 1 : 0;
  if (opts.ai > maxAi) opts.ai = maxAi;
  aiSeg.querySelectorAll('button').forEach((b) => { b.disabled = +b.dataset.v > maxAi; b.classList.toggle('on', +b.dataset.v === opts.ai); });
  if (opts.humans === 2 && !aiSeg.querySelector('[data-v="0"]')) {
    const b0 = document.createElement('button'); b0.dataset.v = '0'; b0.textContent = '0 个';
    aiSeg.prepend(b0);
  }
  if (opts.humans === 1) { aiSeg.querySelector('[data-v="0"]')?.remove(); if (opts.ai < minAi) opts.ai = minAi; }
  aiSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === opts.ai));
  document.getElementById('opt-ai').classList.toggle('hidden', opts.mode === 'team');
  document.querySelector('.char-row[data-player="1"]').classList.toggle('hidden', opts.humans < 2);
  if (opts.chars[0] === opts.chars[1]) opts.chars[1] = (opts.chars[0] + 1) % CHARACTERS.length;
  document.querySelectorAll('.char-row').forEach((row) => {
    const pi = +row.dataset.player;
    row.querySelectorAll('.char-btn').forEach((b, i) => {
      b.classList.toggle('on', opts.chars[pi] === i);
      b.disabled = opts.humans === 2 && opts.chars[1 - pi] === i;
    });
  });
}

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    sound.init(); sound.click();
    const key = seg.dataset.opt;
    const v = b.dataset.v;
    if (key === 'mode') opts.mode = v;
    else if (key === 'humans') opts.humans = +v;
    else if (key === 'ai') opts.ai = +v;
    else if (key === 'difficulty') opts.difficulty = v;
    else if (key === 'map') opts.map = +v;
    else if (key === 'wins') opts.wins = +v;
    refreshMenu();
  });
});

document.getElementById('legend').innerHTML = itemLegendHTML();
const help = document.getElementById('help');
document.getElementById('btn-help').onclick = () => { sound.init(); sound.click(); help.classList.add('show'); };
help.querySelector('[data-close]').onclick = () => { sound.click(); help.classList.remove('show'); };

function startMatch() {
  sound.init();
  const humans = [{ charIdx: opts.chars[0] }];
  if (opts.humans === 2) humans.push({ charIdx: opts.chars[1] });
  const aiCount = opts.mode === 'team' ? 0 : opts.ai;
  if (opts.mode === 'ffa' && humans.length + aiCount < 2) return;
  game.newMatch({ mode: opts.mode, humans, aiCount, difficulty: opts.difficulty, mapIdx: opts.map, winsNeeded: opts.wins });
  camMode = 'game';
  snapCam = true;
}

function toMenu() {
  setPause(false);
  sound.stopMusic();
  game.setupShowcase();
  ui.showScreen('menu');
  ui.clearCenter();
  camMode = 'menu';
}

document.getElementById('btn-start').onclick = startMatch;
document.getElementById('btn-again').onclick = () => { sound.click(); startMatch(); };
document.getElementById('btn-menu').onclick = () => { sound.click(); toMenu(); };

/* ---------- 暂停 ---------- */
const pauseEl = document.getElementById('pause');
function setPause(on) {
  if (on && document.body.dataset.screen !== 'game') return;
  game.paused = on;
  pauseEl.classList.toggle('show', on);
  if (on) sound.stopMusic(); else if (document.body.dataset.screen === 'game' && (game.state === 'playing' || game.state === 'countdown')) sound.startMusic(!!game.sudden);
}
document.getElementById('btn-pause').onclick = () => setPause(!game.paused);
document.getElementById('btn-resume').onclick = () => setPause(false);
document.getElementById('btn-restart').onclick = () => { setPause(false); startMatch(); };
document.getElementById('btn-quit').onclick = () => toMenu();
input.onKey = (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) setPause(!game.paused); }
  if (e.code === 'Enter' && document.body.dataset.screen === 'menu' && !help.classList.contains('show') && !(e.target instanceof HTMLButtonElement)) startMatch();
};
window.addEventListener('blur', () => { if (game.state === 'playing') setPause(true); });

/* ---------- 音频开关 ---------- */
const bMusic = document.getElementById('btn-music');
const bSfx = document.getElementById('btn-sfx');
bMusic.onclick = () => { sound.init(); sound.setMusic(!sound.musicOn); bMusic.classList.toggle('off', !sound.musicOn); };
bSfx.onclick = () => { sound.init(); sound.setSfx(!sound.sfxOn); bSfx.classList.toggle('off', !sound.sfxOn); bSfx.textContent = sound.sfxOn ? '🔊' : '🔇'; };
window.addEventListener('pointerdown', () => sound.init(), { once: true });
window.addEventListener('keydown', () => sound.init(), { once: true });

/* ---------- 相机 ---------- */
let camMode = 'menu';
let snapCam = true;
const camPos = new THREE.Vector3(0, 18, 14);
const camLook = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
let menuAngle = 0.6;
const debugCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

function gameCamPose(outPos, outLook) {
  const aspect = window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 9;
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ht = vt * aspect;
  const elev = THREE.MathUtils.degToRad(53);
  const projDepth = (H + 2) * Math.sin(elev) + 1.0;
  const dV = (projDepth / 2 + 1.35) / vt;
  const dH = (W + 3.4) / 2 / ht;
  const d = Math.max(dV, dH);
  outLook.set(0, 0, 0.95);
  outPos.set(0, Math.sin(elev) * d, Math.cos(elev) * d).add(outLook);
}

function updateCamera(dt) {
  if (camMode === 'debug') {
    tmpPos.copy(debugCam.pos); tmpLook.copy(debugCam.look);
  } else if (camMode === 'menu') {
    menuAngle += dt * 0.08;
    const r = 19;
    tmpPos.set(Math.sin(menuAngle) * r, 10.5, Math.cos(menuAngle) * r);
    tmpLook.set(0, 0.6, 0);
    // 让场景偏到右侧，给左边菜单留位置
    const right = new THREE.Vector3().subVectors(tmpLook, tmpPos).cross(new THREE.Vector3(0, 1, 0)).normalize();
    const shift = window.innerWidth > 900 ? -5.5 : 0;
    tmpLook.addScaledVector(right, shift);
    tmpPos.addScaledVector(right, shift);
  } else {
    gameCamPose(tmpPos, tmpLook);
    if (game.camFocus && game.state === 'roundEnd') {
      tmpLook.copy(game.camFocus).add(new THREE.Vector3(0, 0.5, 0));
      tmpPos.copy(game.camFocus).add(new THREE.Vector3(0, 6.5, 7.5));
    }
  }
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z + camLook.x + camLook.y + camLook.z)) snapCam = true;
  const k = snapCam ? 1 : 1 - Math.exp(-dt * (camMode === 'menu' ? 2 : 3));
  camPos.lerp(tmpPos, k);
  camLook.lerp(tmpLook, k);
  snapCam = false;
  camera.position.copy(camPos);
  const sh = game.shake * game.shake * 0.25;
  if (sh > 0.001) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
  camera.lookAt(camLook);
}

/* ---------- 窗口 ---------- */
let sizeW = window.innerWidth, sizeH = window.innerHeight;
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return;
  sizeW = w; sizeH = h;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

/* ---------- 主循环 ---------- */
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (window.innerWidth !== sizeW || window.innerHeight !== sizeH) onResize();
  game.update(dt);
  if (!game.paused) fx.update(dt);
  updateCamera(dt);
  composer.render();
}

buildCharLists();
refreshMenu();
game.setupShowcase();
ui.showScreen('menu');
loop();

// 调试用：在后台标签页中手动推进
window.__game = game;
window.__cam = (p, l) => { if (!p) { camMode = 'game'; return; } camMode = 'debug'; snapCam = true; debugCam.pos.set(...p); debugCam.look.set(...l); };
window.__step = (n = 1, dt = 1 / 60) => {
  if (window.innerWidth !== sizeW || window.innerHeight !== sizeH) onResize();
  for (let i = 0; i < n; i++) { game.update(dt); if (!game.paused) fx.update(dt); updateCamera(dt); }
  composer.render();
};
