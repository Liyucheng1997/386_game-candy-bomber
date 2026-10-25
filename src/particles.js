// 实例化粒子：水珠、彩色碎屑、星星
import * as THREE from 'three';

class Pool {
  constructor(scene, geometry, material, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = [];
  }
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  }
  update(dt, dummy, col) {
    const arr = this.p;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vy -= q.g * dt;
      const drag = Math.pow(q.drag, dt);
      q.vx *= drag; q.vz *= drag; q.vy *= q.drag < 1 ? Math.pow(0.9, dt) : 1;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.35; q.vx *= 0.6; q.vz *= 0.6; }
      q.rx += q.sx * dt; q.ry += q.sy * dt;
      const k = q.life / q.max;
      const s = q.size * (q.shrink ? Math.min(1, k * 2.2) : 1) * (q.grow ? 1 + (1 - k) * q.grow : 1);
      dummy.position.set(q.x, q.y, q.z);
      dummy.rotation.set(q.rx, q.ry, 0);
      dummy.scale.set(s * q.stretch, s, s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      col.set(q.color);
      this.mesh.setColorAt(n, col);
      arr[n++] = q;
    }
    arr.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.drops = new Pool(scene, new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85, emissive: 0x1a6fa0, emissiveIntensity: 0.25 }), 900);
    this.bits = new Pool(scene, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 900);
    this.stars = new Pool(scene, new THREE.OctahedronGeometry(1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), 300);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  base(x, y, z, o) {
    return {
      x, y, z, vx: 0, vy: 0, vz: 0, g: 9, drag: 0.3, life: 1, max: 1, size: 0.05, color: 0xffffff,
      rx: Math.random() * 6, ry: Math.random() * 6, sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12,
      floor: 0.02, shrink: true, grow: 0, stretch: 1, ...o,
    };
  }

  // 水花四溅
  splash(x, z, count = 10, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 2.5) * power;
      const life = 0.4 + Math.random() * 0.5;
      this.drops.emit(this.base(x, 0.3 + Math.random() * 0.4, z, {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3.5 * power,
        size: 0.04 + Math.random() * 0.06, life, max: life, color: Math.random() < 0.5 ? 0xbff1ff : 0x7fd8ff, g: 12, drag: 0.5,
      }));
    }
  }

  // 方块碎裂
  debris(x, z, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      const life = 0.6 + Math.random() * 0.6;
      this.bits.emit(this.base(x + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.5, {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 4,
        size: 0.06 + Math.random() * 0.09, life, max: life, color: Math.random() < 0.7 ? color : 0xffffff, g: 14, drag: 0.6,
      }));
    }
  }

  // 彩色糖针（庆祝/拾取）
  confetti(x, y, z, count = 30, spread = 3) {
    const cols = [0xff6f9f, 0xffd23f, 0x52e0b8, 0x6c9dff, 0xb07cff, 0xff9a3c];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * spread;
      const life = 1.2 + Math.random() * 1.2;
      this.bits.emit(this.base(x, y, z, {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3 + Math.random() * 5,
        size: 0.035 + Math.random() * 0.03, stretch: 2.6, life, max: life, color: cols[i % cols.length], g: 6, drag: 0.4,
      }));
    }
  }

  sparkle(x, y, z, color = 0xfff3a0, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.8;
      const life = 0.5 + Math.random() * 0.5;
      this.stars.emit(this.base(x, y, z, {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1 + Math.random() * 2.5,
        size: 0.04 + Math.random() * 0.05, life, max: life, color, g: 1.5, drag: 0.2, floor: -10,
      }));
    }
  }

  // 泡泡碎裂的环状水珠
  ring(x, y, z, count = 18, color = 0xd8f6ff) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const life = 0.5 + Math.random() * 0.3;
      this.drops.emit(this.base(x + Math.cos(a) * 0.4, y, z + Math.sin(a) * 0.4, {
        vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 1 + Math.random() * 2,
        size: 0.05 + Math.random() * 0.04, life, max: life, color, g: 8, drag: 0.3,
      }));
    }
  }

  dust(x, z, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const life = 0.4 + Math.random() * 0.3;
      this.drops.emit(this.base(x, 0.08, z, {
        vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.6, size: 0.05, grow: 1.5,
        life, max: life, color: 0xffffff, g: 0, drag: 0.1, shrink: true,
      }));
    }
  }

  update(dt) {
    this.drops.update(dt, this.dummy, this.col);
    this.bits.update(dt, this.dummy, this.col);
    this.stars.update(dt, this.dummy, this.col);
  }
}
