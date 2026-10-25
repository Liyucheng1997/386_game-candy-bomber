// DOM 界面：HUD、提示、浮动文字、结算
import { ITEMS, TEAM_CSS, TEAM_NAMES, MAX_SPEED_LVL } from './constants.js';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor() {
    this.hud = $('#hud');
    this.cardsL = $('#cards-left');
    this.cardsR = $('#cards-right');
    this.timer = $('#timer');
    this.centerEl = $('#center');
    this.popLayer = $('#popups');
    this.tagLayer = $('#tags');
    this.portraits = [];
    this.cards = [];
    this.tags = new Map();
    this.centerTimer = null;
    this.lastTime = '';
  }

  setPortraits(list) { this.portraits = list; }

  showScreen(name) {
    document.body.dataset.screen = name;
  }

  avatar(p) {
    const src = this.portraits[p.charIdx];
    return src ? `<img src="${src}" alt="">` : '';
  }

  buildHUD(players, mode) {
    this.cardsL.innerHTML = '';
    this.cardsR.innerHTML = '';
    this.cards = players.map((p, k) => {
      const el = document.createElement('div');
      el.className = 'pcard';
      const teamColor = mode === 'team' ? TEAM_CSS[p.team] : p.def.css;
      el.style.setProperty('--pc', p.def.css);
      el.style.setProperty('--tc', teamColor);
      el.innerHTML = `
        <div class="pc-avatar">${this.avatar(p)}<div class="pc-x">✕</div></div>
        <div class="pc-main">
          <div class="pc-name"><span class="pc-tag ${p.isAI ? 'ai' : ''}">${p.isAI ? 'CPU' : p.name}</span>${p.def.name}</div>
          <div class="pc-stats">
            <span title="泡泡数">🫧<b data-k="bombs">1</b></span>
            <span title="威力">💧<b data-k="range">2</b></span>
            <span title="速度">🛼<b data-k="speed">1</b></span>
            <span class="pc-extra" data-k="extra"></span>
          </div>
        </div>
        <div class="pc-wins" data-k="wins"></div>`;
      (k % 2 === 0 ? this.cardsL : this.cardsR).appendChild(el);
      const q = (key) => el.querySelector(`[data-k="${key}"]`);
      return { el, bombs: q('bombs'), range: q('range'), speed: q('speed'), extra: q('extra'), wins: q('wins'), sig: '' };
    });
  }

  updateHUD(players, time, sudden, mode, teamWins) {
    players.forEach((p, k) => {
      const c = this.cards[k];
      if (!c) return;
      const sig = [p.maxBombs, p.range, p.speedLvl, p.needles, p.kick, p.shield, p.dead, p.trapped, p.wins].join();
      if (sig === c.sig) return;
      c.sig = sig;
      c.bombs.textContent = p.maxBombs;
      c.range.textContent = p.range;
      c.speed.textContent = p.speedLvl >= MAX_SPEED_LVL ? 'MAX' : p.speedLvl + 1;
      let ex = '';
      if (p.needles) ex += `<i title="救命针">📍${p.needles > 1 ? '×' + p.needles : ''}</i>`;
      if (p.kick) ex += '<i title="踢踢鞋">👟</i>';
      if (p.shield) ex += '<i title="果冻护盾">💗</i>';
      c.extra.innerHTML = ex;
      c.wins.innerHTML = '★'.repeat(p.wins) || '<span class="dim">☆</span>';
      c.el.classList.toggle('dead', p.dead);
      c.el.classList.toggle('trapped', p.trapped);
    });
    const t = Math.max(0, Math.ceil(time));
    const str = sudden ? '加时!' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (str !== this.lastTime) {
      this.lastTime = str;
      this.timer.textContent = str;
      this.timer.classList.toggle('hurry', sudden || t <= 20);
    }
  }

  center(text, sub = '', cls = '') {
    const el = this.centerEl;
    el.className = '';
    void el.offsetWidth;
    el.innerHTML = `<div class="big">${text}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    el.className = 'show ' + cls;
    clearTimeout(this.centerTimer);
    const dur = { count: 850, go: 900, round: 2600, sudden: 2400 }[cls];
    if (dur) this.centerTimer = setTimeout(() => this.clearCenter(), dur);
  }

  clearCenter() { this.centerEl.className = ''; }

  popup(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--c', color);
    this.popLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  addTag(slot, name, color) {
    const el = document.createElement('div');
    el.className = 'ptag';
    el.textContent = name;
    el.style.setProperty('--c', color);
    this.tagLayer.appendChild(el);
    this.tags.set(slot, el);
  }
  setTag(slot, x, y, visible) {
    const el = this.tags.get(slot);
    if (!el) return;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    el.style.display = visible ? '' : 'none';
  }
  clearTags() { this.tagLayer.innerHTML = ''; this.tags.clear(); }

  showResult({ title, ranking, mode, teamWins }) {
    $('#result-title').textContent = title;
    const medals = ['🥇', '🥈', '🥉', '🎈'];
    $('#result-list').innerHTML = ranking.map((p, i) => `
      <div class="rrow" style="--pc:${p.def.css}; --tc:${mode === 'team' ? TEAM_CSS[p.team] : p.def.css}">
        <div class="rmedal">${mode === 'team' ? (teamWins[p.team] >= Math.max(teamWins.A, teamWins.B) ? '🏆' : '🎈') : medals[i]}</div>
        <div class="ravatar">${this.avatar(p)}</div>
        <div class="rname"><b>${p.isAI ? 'CPU' : p.name}</b> ${p.def.name}${mode === 'team' ? `<small>${TEAM_NAMES[p.team]}</small>` : ''}</div>
        <div class="rstat"><span>胜场</span><b>${p.wins}</b></div>
        <div class="rstat"><span>击破</span><b>${p.stats.kills}</b></div>
        <div class="rstat"><span>道具</span><b>${p.stats.items}</b></div>
        <div class="rstat"><span>救援</span><b>${p.stats.rescues}</b></div>
      </div>`).join('');
    this.showScreen('result');
  }
}

export function itemLegendHTML() {
  return Object.values(ITEMS).map((it) => `<div class="legend-item"><span>${it.icon}</span><b>${it.name}</b><em>${it.tip}</em></div>`).join('');
}
