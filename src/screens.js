// HTML for the menu, championship, results and service screens.
import { CARS, carStats, WEEKLY_CARS, weeklyCar } from './cars.js';
import { ENVIRONMENTS, getEnvironment } from './environments.js';
import { TUNING } from './vehicle.js';
import {
  CAR_PRICES, UPGRADES, LIVERIES, formatMoney, ownsCar, upgradeLevel, upgradePrice, ownsLivery, selectedLivery, liveryColors, tunedOverrides,
} from './profile.js';
import { rateCar, STAT_NAMES } from './ratings.js';

// rating of a car with the player's tuning (profile null = stock); extra = hypothetical upgrade levels
function ratingFor(profile, carId, extra = null) {
  let p = profile;
  if (extra) p = { ...profile, upgrades: { ...profile.upgrades, [carId]: { ...(profile.upgrades[carId] || {}), ...extra } } };
  return rateCar({ ...TUNING, ...tunedOverrides(p, carId, TUNING) });
}

export function piBadge(r, big = false) {
  return `<span class="pi-badge${big ? ' big' : ''}" style="--c:${r.cls.color}"><b>${r.cls.id}</b><span>${r.pi}</span></span>`;
}

function ratingPanel(r) {
  const f = r.figures;
  const bars = Object.entries(STAT_NAMES).map(([k, name]) =>
    `<div class="st-row"><span>${name}</span><div class="st-bar"><i style="width:${(r.stats[k] * 10).toFixed(0)}%"></i></div><b>${r.stats[k].toFixed(1).replace('.', ',')}</b></div>`).join('');
  return `<div class="rating">${piBadge(r, true)}<div class="st">${bars}</div></div>
    <p class="small figures">Spitze ${Math.round(f.vmax)} km/h · 0–100 km/h in ${f.t100.toFixed(1).replace('.', ',')} s · Bremsweg 100–0: ${f.brake.toFixed(1).replace('.', ',')} m · Grip ${f.grip.toFixed(2).replace('.', ',')}</p>`;
}
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

const hex = (v) => `#${v.toString(16).padStart(6, '0')}`;

// profile given: cars you do not own are locked (bought in the garage)
export function carCards(selected, profile = null, only = null) {
  return `<div class="cards">${Object.values(CARS).filter((c) => !only || only.includes(c.id)).map((c) => {
    const s = carStats(c, TUNING);
    const liv = liveryColors(c.id, profile ? selectedLivery(profile, c.id) : 'werk');
    const locked = profile && !ownsCar(profile, c.id);
    return `<button class="card${c.id === selected && !locked ? ' selected' : ''}${locked ? ' locked' : ''}" data-car="${c.id}"${locked ? ' disabled' : ''}>
      <div class="card-swatch" style="background:linear-gradient(90deg, ${hex(liv.color)} 70%, ${hex(liv.stripe)} 70%)"></div>
      <div class="card-title">${locked ? '🔒 ' : ''}${esc(c.name)} ${piBadge(ratingFor(locked ? null : profile, c.id))}</div>
      <div class="card-sub">${esc(c.drive)} · ${s.power} kW · ${s.mass} kg</div>
      <div class="card-text">${locked ? `In der Garage für ${formatMoney(CAR_PRICES[c.id])} freischalten.` : esc(c.tagline)}</div></button>`;
  }).join('')}</div>`;
}

// ---------- garage ----------
export function garageHtml(p, carId) {
  const car = CARS[carId];
  const carRows = Object.values(CARS).map((c) => {
    const own = ownsCar(p, c.id);
    const price = CAR_PRICES[c.id];
    const liv = liveryColors(c.id, own ? selectedLivery(p, c.id) : 'werk');
    return `<div class="g-car${c.id === carId ? ' active' : ''}">
      <div class="card-swatch" style="background:linear-gradient(90deg, ${hex(liv.color)} 70%, ${hex(liv.stripe)} 70%)"></div>
      <b>${esc(c.name)} ${piBadge(ratingFor(own ? p : null, c.id))}</b><span class="small">${esc(c.drive)}</span>
      ${own ? `<button class="btn" data-g-car="${c.id}">${c.id === carId ? 'In Bearbeitung' : 'Bearbeiten'}</button>`
        : `<button class="btn primary" data-g-buycar="${c.id}"${p.money < price ? ' disabled' : ''}>Kaufen · ${formatMoney(price)}</button>`}
    </div>`;
  }).join('');
  const current = ratingFor(p, carId);
  const tuning = Object.entries(UPGRADES).map(([part, u]) => {
    const level = upgradeLevel(p, carId, part);
    const price = upgradePrice(carId, part, level);
    const pips = [0, 1, 2].map((i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    const gain = price === undefined ? 0 : ratingFor(p, carId, { [part]: level + 1 }).pi - current.pi;
    const btn = price === undefined ? '<span class="small">Maximal</span>'
      : `<button class="btn" data-g-up="${part}"${p.money < price ? ' disabled' : ''}>Stufe ${level + 1} · ${formatMoney(price)} <span class="pi-gain${gain ? '' : ' zero'}">+${gain} PI</span></button>`;
    return `<div class="g-row"><div><b>${u.name}</b><div class="small">${u.text}</div></div><div class="pips">${pips}</div>${btn}</div>`;
  }).join('');
  const sel = selectedLivery(p, carId);
  const liveries = LIVERIES.map((l) => {
    const c = liveryColors(carId, l.id);
    const own = ownsLivery(p, carId, l.id);
    const label = l.id === sel ? 'gewählt' : own ? 'wählen' : formatMoney(l.price);
    return `<button class="g-liv${l.id === sel ? ' selected' : ''}" data-g-liv="${l.id}"${!own && p.money < l.price ? ' disabled' : ''}>
      <span class="g-sw" style="background:linear-gradient(135deg, ${hex(c.color)} 55%, ${hex(c.stripe)} 55%, ${hex(c.stripe)} 75%, ${hex(c.accent)} 75%)"></span>
      <b>${esc(l.name)}</b><span class="small">${label}</span></button>`;
  }).join('');
  return `<div class="wallet big">💰 ${formatMoney(p.money)} <span class="small">· insgesamt verdient ${formatMoney(p.earned || 0)}</span></div>
    <p class="small">Preisgeld gibt es in der Meisterschaft: nach jeder Rallye für die Platzierung, am Ende eine Prämie für den Endstand. Tuning gilt in Meisterschaft und freier Fahrt, nicht bei der Strecke der Woche.</p>
    <div class="label">Autos</div><div class="g-cars">${carRows}</div>
    <div class="label">Bewertung · ${esc(car.name)}</div>${ratingPanel(current)}
    <div class="label">Tuning · ${esc(car.name)}</div>${tuning}
    <div class="label">Lackierung · ${esc(car.name)}</div><div class="g-livs">${liveries}</div>`;
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
export function menuScreen({ champ, car, env, seed, hostCode, weekly, profile }) {
  const cont = champ && !champ.finished
    ? `<button class="btn primary" id="m-champ-continue">Fortsetzen · ${RALLIES[champ.rally].icon} ${esc(RALLIES[champ.rally].name)}, WP ${champ.stage + 1}/${STAGES_PER_RALLY}</button>`
    : '';
  return `
  <div class="wallet">💰 ${formatMoney(profile.money)}</div>
  <div class="tabs">
    <button class="tab active" data-tab="champ">Meisterschaft</button>
    <button class="tab" data-tab="free">Freie Fahrt</button>
    <button class="tab" data-tab="weekly">Woche</button>
    <button class="tab" data-tab="garage">Garage</button>
    <button class="tab" data-tab="coop">Koop</button>
  </div>
  <section data-pane="champ">
    <p class="sub">${RALLIES.length} Rallyes mit je ${STAGES_PER_RALLY} Wertungsprüfungen gegen ${7} Gegner. Repariert wird nur nach jeder Rallye: ${SERVICE_MINUTES} Minuten Service. Zwischen den Prüfungen fährst du mit dem Schaden weiter.</p>
    <div class="rally-list">${RALLIES.map((r) => `<span>${r.icon} ${esc(r.name)}</span>`).join('')}</div>
    ${cont}
    <div class="label">Auto für eine neue Meisterschaft</div>
    ${carCards(car, profile)}
    <button class="btn${cont ? '' : ' primary'}" id="m-champ-new">Neue Meisterschaft starten</button>
  </section>
  <section data-pane="free" class="hidden">
    <div class="label">Auto</div>
    ${carCards(car, profile)}
    <div class="label">Untergrund</div>
    ${envButtons(env)}
    <div class="free-row">
      <span>Strecke #${seed}</span>
      <button class="btn" id="m-free-random">Andere Strecke</button>
      <button class="btn primary" id="m-free-go">Losfahren <span class="small">(Enter)</span></button>
    </div>
  </section>
  <section data-pane="weekly" class="hidden">
    ${weeklyPane(weekly, car)}
  </section>
  <section data-pane="garage" class="hidden"><div id="garage"></div></section>
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
  <p class="small">${champ.stage > 0 ? 'Kein Service bis zum Ende der Rallye. ' : ''}Strafen wie bei einer echten Rallye: Frühstart 10 s / 1 min / 3 min · Abkürzen +5 s, danach +10 s · länger als 5 s neben der Strecke = Zurücksetzen +5 s · R = Bergung +5 s. Kein Neustart; Esc = aufgeben (Bestzeit der Prüfung + 10 Minuten).</p>
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
export function champResultScreen(champ, rally, stage, rallyDone, penalty, note = '', prize = '') {
  const sr = stageResults(champ, rally, stage);
  const pos = sr.findIndex((r) => r.player) + 1;
  const r = RALLIES[rally];
  let html = `<div class="champ-head">${r.icon} ${esc(r.name)} · WP ${stage + 1}</div>
    <p class="sub">${note ? `${esc(note)} · ` : ''}Platz ${pos} von ${sr.length}${penalty ? ` · inkl. ${penalty.toFixed(1).replace('.', ',')} s Strafe` : ''}</p>
    <div class="two-col"><div>${standingsTable(sr, 'Wertungsprüfung', true)}</div>
    <div>${standingsTable(rallyStandings(champ, rally), rallyDone ? 'Endstand Rallye' : 'Gesamt Rallye', true)}</div></div>`;
  if (prize) html += `<div class="prize">💰 ${prize}</div>`;
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
  const bonus = champ.finalPrize ? `<div class="prize">💰 Prämie für Platz ${pos}: +${formatMoney(champ.finalPrize)} · eingelöst in der Garage</div>` : '';
  return `<div class="champ-head">${title}</div>${bonus}${pointsTable(rows)}
    <button class="btn primary" id="f-new">Neue Meisterschaft</button>`;
}

export { PLAYER };

// ---------- Strecke der Woche ----------
const dateDe = (d) => d.toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

function weeklyPane(weekly, car) {
  const env = getEnvironment(weekly.env);
  const until = new Date(weekly.week.end.getTime() - 86400000);
  return `<p class="sub">Eine Strecke für alle, jede Woche neu. Du kannst so oft fahren, wie du willst – in der Rangliste zählt deine beste Zeit (inkl. Strafen). Hier fahren alle mit den drei Basisautos in Serie: jedes davon ist verfügbar, Tuning zählt nicht.</p>
    <div class="weekly-head"><b>${esc(weekly.week.id.replace('-W', ' · KW '))}</b> · ${dateDe(weekly.week.start)}–${dateDe(until)} · ${esc(env.name)} (${esc(env.surfaceName)}) · Strecke #${weekly.seed}</div>
    <div class="label">Auto</div>
    ${carCards(weeklyCar(car), null, WEEKLY_CARS)}
    <button class="btn primary" id="m-weekly-go">Strecke der Woche fahren</button>
    <div class="label">Rangliste</div>
    <div id="weekly-list" class="weekly-list"><p class="small">Lade …</p></div>`;
}

export function weeklyTable(rows, myName) {
  if (!rows.length) return '<p class="small">Noch keine Zeiten diese Woche – sei der Erste!</p>';
  const me = (myName || '').trim().toLowerCase();
  const best = rows[0].time_ms;
  return `<table class="standings">${rows.map((r, i) => `<tr class="${r.name.trim().toLowerCase() === me ? 'me' : ''}">
    <td>${i + 1}.</td><td>${esc(r.name)}</td><td class="small">${esc(CARS[r.car] ? CARS[r.car].name : r.car)}</td>
    <td>${formatTime(r.time_ms / 1000)}</td><td>${i ? '+' + ((r.time_ms - best) / 1000).toFixed(2) : ''}</td></tr>`).join('')}</table>`;
}

export function weeklyResultScreen(t, penalty, name, personalBest, ready) {
  const pen = penalty > 0.05 ? ` · inkl. ${penalty.toFixed(1).replace('.', ',')} s Strafe` : '';
  const pb = personalBest != null ? `<div class="result-best">${t <= personalBest ? 'Deine beste Zeit diese Woche!' : `Deine Bestzeit diese Woche: ${formatTime(personalBest)}`}</div>` : '';
  const form = ready ? `<div class="weekly-form">
      <input id="w-name" maxlength="20" placeholder="Dein Name" autocomplete="nickname" spellcheck="false" value="${esc(name || '')}" />
      <button class="btn primary" id="w-submit">Zeit eintragen</button>
    </div><p class="small" id="w-status"></p>` : '<p class="small">Die Online-Rangliste ist noch nicht eingerichtet.</p>';
  return `<p class="sub">Strecke der Woche${pen}</p><div class="result-time">${formatTime(t)}</div>${pb}${form}
    <div id="weekly-list" class="weekly-list"></div>
    <button class="btn" id="w-again">Nochmal fahren <span class="small">(Enter)</span></button>
    <button class="btn ghost" id="w-menu">Hauptmenü</button>`;
}
