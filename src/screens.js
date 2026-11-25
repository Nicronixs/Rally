// HTML for the menu, championship, results and service screens.
import { CARS, carStats } from './cars.js';
import { ENVIRONMENTS } from './environments.js';
import { TUNING } from './vehicle.js';
import {
  RALLIES, STAGES_PER_RALLY, SERVICE_MINUTES, PLAYER,
  stageResults, rallyStandings, championshipStandings, repairCost,
} from './championship.js';

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function carCards(selected) {
  return `<div class="cards">${Object.values(CARS).map((c) => {
    const s = carStats(c, TUNING);
    const col = `#${c.livery.color.toString(16).padStart(6, '0')}`;
    const st = `#${c.livery.stripe.toString(16).padStart(6, '0')}`;
    return `<button class="card${c.id === selected ? ' selected' : ''}" data-car="${c.id}">
      <div class="card-swatch" style="background:linear-gradient(90deg, ${col} 70%, ${st} 70%)"></div>
      <div class="card-title">${esc(c.name)}</div>
      <div class="card-sub">${esc(c.drive)} · ${s.power} kW · ${s.mass} kg</div>
      <div class="card-text">${esc(c.tagline)}</div></button>`;
  }).join('')}</div>`;
}

export function envButtons(selected) {
  return `<div class="env-row">${Object.values(ENVIRONMENTS).map((e) =>
    `<button class="chip${e.id === selected ? ' selected' : ''}" data-env="${e.id}">${esc(e.name)}<span>${esc(e.surfaceName)}</span></button>`).join('')}</div>`;
}

function damageBars(d) {
  const row = (label, v) => `<div class="dmg-row"><span>${label}</span><div class="dmg-bar"><div style="width:${Math.round(v * 100)}%;background:${barColor(v)}"></div></div><b>${Math.round(v * 100)}%</b></div>`;
  return row('Motor', d.engine) + row('Fahrwerk', d.suspension) + row('Karosserie', d.body);
}
export function barColor(v) {
  return v < 0.25 ? '#6dd56d' : v < 0.6 ? '#ffc93a' : '#ff5a43';
}

// Main menu
export function menuScreen({ champ, car, env, seed, hostCode }) {
  const cont = champ && !champ.finished
    ? `<button class="btn primary" id="m-champ-continue">Fortsetzen · ${RALLIES[champ.rally].icon} ${esc(RALLIES[champ.rally].name)}, WP ${champ.stage + 1}/${STAGES_PER_RALLY}</button>`
    : '';
  return `
  <div class="tabs">
    <button class="tab active" data-tab="champ">Meisterschaft</button>
    <button class="tab" data-tab="free">Freie Fahrt</button>
    <button class="tab" data-tab="coop">Koop</button>
  </div>
  <section data-pane="champ">
    <p class="sub">${RALLIES.length} Rallyes mit je ${STAGES_PER_RALLY} Wertungsprüfungen gegen ${7} Gegner. Repariert wird nur nach jeder Rallye: ${SERVICE_MINUTES} Minuten Service. Zwischen den Prüfungen fährst du mit dem Schaden weiter.</p>
    <div class="rally-list">${RALLIES.map((r) => `<span>${r.icon} ${esc(r.name)}</span>`).join('')}</div>
    ${cont}
    <div class="label">Auto für eine neue Meisterschaft</div>
    ${carCards(car)}
    <button class="btn${cont ? '' : ' primary'}" id="m-champ-new">Neue Meisterschaft starten</button>
  </section>
  <section data-pane="free" class="hidden">
    <div class="label">Auto</div>
    ${carCards(car)}
    <div class="label">Untergrund</div>
    ${envButtons(env)}
    <div class="free-row">
      <span>Strecke #${seed}</span>
      <button class="btn" id="m-free-random">Andere Strecke</button>
      <button class="btn primary" id="m-free-go">Losfahren <span class="small">(Enter)</span></button>
    </div>
  </section>
  <section data-pane="coop" class="hidden">
    <p class="sub">Einer fährt, der andere sagt auf einem zweiten Gerät den Aufschrieb an.</p>
    <div class="menu-coop">
      <div class="menu-col">
        <div class="menu-label">Fahrer</div>
        ${hostCode
          ? `<div class="room-code-small">Raum <b>${esc(hostCode)}</b> ist offen</div><button class="btn" id="m-host-stop">Raum schließen</button>`
          : '<button class="btn" id="m-host">Raum erstellen</button>'}
        <p class="small">Danach Meisterschaft oder freie Fahrt wählen – der Beifahrer folgt automatisch.</p>
      </div>
      <div class="menu-col">
        <div class="menu-label">Beifahrer</div>
        <div class="join-row">
          <input id="join-code" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" />
          <button class="btn" id="btn-join">Beitreten</button>
        </div>
      </div>
    </div>
  </section>
  <div id="lobby" class="hidden"><div id="room-code"></div><div id="lobby-status"></div></div>
  <p id="menu-error"></p>`;
}

// Before a championship stage
export function champIntroScreen(champ, carName, envName, stageKm) {
  const r = RALLIES[champ.rally];
  const d = champ.damage;
  const hurt = d.engine + d.suspension + d.body > 0.02;
  return `
  <div class="champ-head">${r.icon} ${esc(r.name)}</div>
  <p class="sub">Wertungsprüfung ${champ.stage + 1} von ${STAGES_PER_RALLY} · ${esc(envName)} · ${stageKm} km · ${esc(carName)}</p>
  ${champ.stage > 0 ? standingsTable(rallyStandings(champ, champ.rally), 'Zwischenstand Rallye', true) : ''}
  ${hurt ? `<div class="label">Zustand des Autos</div>${damageBars(d)}` : ''}
  <p class="small">${champ.stage > 0 ? 'Kein Service bis zum Ende der Rallye. ' : ''}R = Bergung zurück auf die Strecke (+5 s Strafe). Kein Neustart in der Meisterschaft.</p>
  <button class="btn primary" id="c-go">Etappe starten <span class="small">(Enter)</span></button>
  <button class="btn ghost" id="c-menu">Hauptmenü</button>`;
}

function standingsTable(rows, title, gaps) {
  const best = rows[0] ? rows[0].time : 0;
  return `<div class="label">${esc(title)}</div><table class="standings">${rows.map((r, i) =>
    `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}.</td><td>${esc(r.name)}</td><td>${formatTime(r.time)}</td><td>${gaps && i > 0 ? '+' + (r.time - best).toFixed(2) : ''}</td></tr>`).join('')}</table>`;
}

function pointsTable(rows) {
  return `<div class="label">Meisterschaft</div><table class="standings">${rows.map((r, i) =>
    `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}.</td><td>${esc(r.name)}</td><td>${r.points} Pkt.</td></tr>`).join('')}</table>`;
}

// After a championship stage
export function champResultScreen(champ, rally, stage, rallyDone, penalty) {
  const sr = stageResults(champ, rally, stage);
  const pos = sr.findIndex((r) => r.player) + 1;
  const r = RALLIES[rally];
  let html = `<div class="champ-head">${r.icon} ${esc(r.name)} · WP ${stage + 1}</div>
    <p class="sub">Platz ${pos} von ${sr.length}${penalty ? ` · inkl. ${penalty} s Strafe` : ''}</p>
    <div class="two-col"><div>${standingsTable(sr, 'Wertungsprüfung', true)}</div>
    <div>${standingsTable(rallyStandings(champ, rally), rallyDone ? 'Endstand Rallye' : 'Gesamt Rallye', true)}</div></div>`;
  if (rallyDone) html += pointsTable(championshipStandings(champ));
  const next = champ.finished ? 'Endergebnis' : rallyDone ? 'Zum Service' : 'Nächste Prüfung';
  html += `<button class="btn primary" id="r-next">${next} <span class="small">(Enter)</span></button>`;
  return { html, pos };
}

export function serviceScreen(champ) {
  const d = champ.damage;
  const cost = repairCost(d);
  const part = (id, label) => d[id] > 0.005
    ? `<label class="svc-row"><input type="checkbox" data-part="${id}" checked /> ${label} <span>${Math.round(d[id] * 100)}% · ${cost[id]} min</span></label>`
    : `<div class="svc-row ok">${label} <span>in Ordnung</span></div>`;
  return `<div class="champ-head">🔧 Service</div>
    <p class="sub">Rallye beendet – ${SERVICE_MINUTES} Minuten Zeit vor der nächsten Rallye. Was nicht repariert wird, bleibt.</p>
    ${damageBars(d)}
    <div class="svc">${part('engine', 'Motor')}${part('suspension', 'Fahrwerk')}${part('body', 'Karosserie')}</div>
    <p id="svc-budget"></p>
    <button class="btn primary" id="s-go">Zur nächsten Rallye <span class="small">(Enter)</span></button>`;
}

export function finalScreen(champ) {
  const rows = championshipStandings(champ);
  const pos = rows.findIndex((r) => r.player) + 1;
  const title = pos === 1 ? '🏆 Meister!' : `Meisterschaft beendet – Platz ${pos}`;
  return `<div class="champ-head">${title}</div>${pointsTable(rows)}
    <button class="btn primary" id="f-new">Neue Meisterschaft</button>`;
}

export { PLAYER };
