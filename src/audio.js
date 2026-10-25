// WebAudio 合成音效与背景音乐（无外部资源）
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.tempo = 128;
    this.step = 0;
    this.nextTime = 0;
    this.playing = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.22; this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.9 : 0; }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.value = on ? 0.22 : 0; }

  tone(freq, dur, { type = 'sine', vol = 0.3, slide = null, delay = 0, attack = 0.005, out = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, type = 'lowpass', freq = 2000, freqEnd = null, q = 1, delay = 0, out = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  place() {
    this.tone(260, 0.14, { type: 'sine', vol: 0.35, slide: 560 });
    this.tone(520, 0.08, { type: 'triangle', vol: 0.12, delay: 0.05, slide: 780 });
  }
  explode() {
    this.noise(0.6, { vol: 0.55, freq: 2400, freqEnd: 180 });
    this.tone(140, 0.4, { type: 'sine', vol: 0.5, slide: 40 });
    for (let i = 0; i < 5; i++) this.tone(500 + Math.random() * 900, 0.08, { type: 'sine', vol: 0.12, delay: 0.05 + i * 0.05 + Math.random() * 0.03, slide: 1400 + Math.random() * 600 });
  }
  pickup() {
    [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(76 + n), 0.14, { type: 'triangle', vol: 0.2, delay: i * 0.055 }));
  }
  trap() {
    for (let i = 0; i < 6; i++) this.tone(380 + i * 60, 0.12, { type: 'sine', vol: 0.18, delay: i * 0.05, slide: 300 + i * 40 });
  }
  pop() {
    this.noise(0.12, { vol: 0.5, type: 'highpass', freq: 1500 });
    this.tone(950, 0.35, { type: 'square', vol: 0.12, slide: 120 });
    this.tone(300, 0.5, { type: 'sine', vol: 0.3, slide: 60, delay: 0.05 });
  }
  rescue() {
    [0, 5, 9, 12, 17].forEach((n, i) => this.tone(mtof(72 + n), 0.12, { type: 'square', vol: 0.08, delay: i * 0.05 }));
  }
  shield() {
    this.tone(880, 0.3, { type: 'triangle', vol: 0.25, slide: 440 });
    this.noise(0.2, { vol: 0.15, type: 'bandpass', freq: 3000 });
  }
  kick() { this.tone(220, 0.12, { type: 'square', vol: 0.12, slide: 90 }); this.noise(0.08, { vol: 0.2, freq: 900 }); }
  thud() { this.tone(90, 0.3, { type: 'sine', vol: 0.5, slide: 40 }); this.noise(0.2, { vol: 0.3, freq: 600 }); }
  beep(hi = false) { this.tone(hi ? 1046 : 660, hi ? 0.45 : 0.18, { type: 'square', vol: 0.12 }); }
  click() { this.tone(900, 0.05, { type: 'triangle', vol: 0.15 }); }
  win() {
    const seq = [72, 76, 79, 84, 79, 84, 88];
    seq.forEach((n, i) => this.tone(mtof(n), i === seq.length - 1 ? 0.6 : 0.16, { type: 'square', vol: 0.1, delay: i * 0.12 }));
    seq.forEach((n, i) => this.tone(mtof(n - 12), 0.16, { type: 'triangle', vol: 0.15, delay: i * 0.12 }));
  }
  lose() {
    [67, 66, 65, 62].forEach((n, i) => this.tone(mtof(n), 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.2 }));
  }

  /* ---------- 背景音乐：I-vi-IV-V 欢快循环 ---------- */
  startMusic(fast = false) { this.playing = true; this.tempo = fast ? 158 : 128; if (this.ctx) this.nextTime = this.ctx.currentTime + 0.05; }
  stopMusic() { this.playing = false; }

  schedule() {
    if (!this.ctx || !this.playing) return;
    const spb = 60 / this.tempo / 2; // 8分音符
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const bar = (step >> 3) % 8;
    const roots = [48, 45, 41, 43, 48, 45, 41, 43];
    const mel = [
      [76, 79, 84, 79, 76, 79, 81, 79],
      [81, 84, 88, 84, 81, 84, 86, 84],
      [77, 81, 84, 89, 88, 86, 84, 81],
      [79, 83, 86, 91, 89, 86, 83, 79],
      [84, null, 83, 84, 86, 84, 83, 79],
      [81, null, 79, 81, 84, 81, 79, 76],
      [77, 79, 81, 84, 81, 79, 77, 76],
      [74, 76, 79, 83, 86, null, 83, null],
    ];
    const s = step % 8;
    const delay = Math.max(0, t - this.ctx.currentTime);
    const out = this.music;
    const n = mel[bar][s];
    if (n) this.tone(mtof(n), 0.16, { type: 'square', vol: 0.09, delay, out });
    if (n && s % 2 === 0) this.tone(mtof(n + 12), 0.08, { type: 'triangle', vol: 0.04, delay: delay + 0.01, out });
    const r = roots[bar];
    this.tone(mtof(s % 2 ? r + 12 : r), 0.2, { type: 'triangle', vol: 0.28, delay, out });
    if (s % 4 === 0) this.tone(150, 0.12, { type: 'sine', vol: 0.45, slide: 45, delay, out });
    if (s % 4 === 2) this.noise(0.12, { vol: 0.22, type: 'bandpass', freq: 1800, q: 0.8, delay, out });
    this.noise(0.04, { vol: 0.08, type: 'highpass', freq: 7000, delay, out });
  }
}
