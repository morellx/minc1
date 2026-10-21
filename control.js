const $ = (id) => document.getElementById(id);
const socket = io();
const counter = DeathCounter.createCounter($('previewRoot'));
const STORAGE_KEY = 'deathCounterV7';

/* ---------- Estado ---------- */
const defaults = () => ({
  players: [
    { enabled: true,  deaths: 0, skin: 'Steve', custom: '' },
    { enabled: false, deaths: 0, skin: 'Alex',  custom: '' },
    { enabled: false, deaths: 0, skin: 'Steve', custom: '' }
  ],
  labelText: 'MUERTES',
  timerLabel: 'TIMER',
  color: '#ffffff',
  size: 38,
  bgOpacity: 62,
  animation: 'bounce',
  cardPos: 'tl',
  showTimer: true,
  rev: 0, // marca de tiempo del último cambio real hecho en este panel
  // base = ms acumulados hasta la última pausa; startedAt = momento en que se reanudó
  timer: { running: false, base: 0, startedAt: 0 }
});

function loadState() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return base;
    const merged = { ...base, ...saved };
    merged.players = base.players.map((p, i) => ({ ...p, ...(saved.players?.[i] || {}) }));
    merged.players[0].enabled = true;
    merged.timer = { ...base.timer, ...(saved.timer || {}) };
    return merged;
  } catch {
    return base;
  }
}

const state = loadState();
const user = (p) => (p.skin === 'custom' ? (p.custom.trim() || 'Steve') : p.skin);
const getElapsed = () =>
  state.timer.base + (state.timer.running ? Date.now() - state.timer.startedAt : 0);

/* ---------- Filas de jugadores ---------- */
const rows = state.players.map((p, i) => {
  const el = document.createElement('div');
  el.className = 'prow';
  el.innerHTML = `
    <img class="phead" alt="" data-role="head">
    <div class="pinfo">
      <div class="pname">Jugador ${i + 1} <kbd>${i + 1}</kbd></div>
      <select data-role="skin" aria-label="Personaje del jugador ${i + 1}">
        <option value="Steve">Steve</option>
        <option value="Alex">Alex</option>
        <option value="custom">Nombre custom</option>
      </select>
      <input type="text" data-role="username" placeholder="Usuario de Minecraft" aria-label="Usuario de Minecraft">
    </div>
    <div class="pcounter">
      <button type="button" class="btn-control ghost" data-role="sub" aria-label="Restar una muerte">−1</button>
      <span class="pcount" data-role="count">0</span>
      <button type="button" class="btn-control primary" data-role="add">+1</button>
    </div>
    ${i > 0
      ? `<label class="switch" title="Activar jugador"><input type="checkbox" data-role="enable"><span class="slider"></span></label>`
      : '<span></span>'}`;
  $('players').appendChild(el);
  const q = (r) => el.querySelector(`[data-role="${r}"]`);
  return { el, enable: q('enable'), head: q('head'), count: q('count'), add: q('add'),
           sub: q('sub'), skin: q('skin'), username: q('username') };
});

/* ---------- Estado de conexión ---------- */
const conn = $('connStatus');
const setConn = (ok, msg) => { conn.textContent = msg; conn.className = `conn ${ok ? 'ok' : 'bad'}`; };

/* ---------- Payload, guardado y envío ---------- */
function buildPayload(trigger = -1) {
  return {
    players: state.players.map((p) => ({ enabled: p.enabled, deaths: p.deaths, username: user(p) })),
    labelText: state.labelText,
    timerLabel: state.timerLabel,
    color: state.color,
    size: state.size,
    bgOpacity: state.bgOpacity,
    animation: state.animation,
    cardPos: state.cardPos,
    showTimer: state.showTimer,
    rev: state.rev,
    timer: { running: state.timer.running, elapsed: getElapsed() },
    trigger // índice del jugador que acaba de morir (-1 = ninguno)
  };
}

const send = (payload) => socket.emit('updateDeathState', payload);

function refreshControls() {
  state.players.forEach((p, i) => {
    const r = rows[i];
    r.el.classList.toggle('off', !p.enabled);
    r.count.textContent = p.deaths;
    [r.add, r.sub, r.skin, r.username].forEach((c) => (c.disabled = !p.enabled));
    r.username.style.display = p.skin === 'custom' ? '' : 'none';
    const name = user(p);
    if (r.head.dataset.user !== name) { r.head.dataset.user = name; r.head.src = DeathCounter.skinUrl(name); }
  });

  const { running, base } = state.timer;
  $('btnTimerToggle').innerHTML = running
    ? '<i class="fa-solid fa-pause"></i> Pausar'
    : `<i class="fa-solid fa-play"></i> ${base > 0 ? 'Reanudar' : 'Iniciar'}`;
  const st = $('timerState');
  st.textContent = running ? 'En marcha' : (base > 0 ? 'En pausa' : 'Detenido');
  st.className = `timer-state ${running ? 'running' : (base > 0 ? 'paused' : '')}`;
}

function commit(trigger = -1, bump = true) {
  if (bump) state.rev = Date.now();
  const payload = buildPayload(trigger);
  counter.render(payload);
  if (trigger >= 0) counter.playAnim(trigger, state.animation);
  refreshControls();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  send(payload);
}

/* ---------- Jugadores ---------- */
const addDeath = (i) => { if (state.players[i].enabled) { state.players[i].deaths++; commit(i); } };
const subDeath = (i) => {
  const p = state.players[i];
  if (p.enabled && p.deaths > 0) { p.deaths--; commit(); }
};

rows.forEach((r, i) => {
  const p = state.players[i];
  r.add.addEventListener('click', () => addDeath(i));
  r.sub.addEventListener('click', () => subDeath(i));
  r.skin.addEventListener('change', (e) => { p.skin = e.target.value; commit(); });
  r.username.addEventListener('input', (e) => { p.custom = e.target.value; commit(); });
  if (r.enable) r.enable.addEventListener('change', (e) => { p.enabled = e.target.checked; commit(); });
});

// Reiniciar muertes: pide un segundo clic para confirmar
const btnReset = $('btnResetDeaths');
const resetLabel = btnReset.innerHTML;
let armed = false, armTimeout;
function disarm() { armed = false; clearTimeout(armTimeout); btnReset.innerHTML = resetLabel; btnReset.classList.remove('armed'); }
btnReset.addEventListener('click', () => {
  if (!armed) {
    armed = true;
    btnReset.textContent = '¿Seguro? Clic otra vez';
    btnReset.classList.add('armed');
    armTimeout = setTimeout(disarm, 3000);
    return;
  }
  state.players.forEach((p) => (p.deaths = 0));
  disarm();
  commit();
});

/* ---------- Timer ---------- */
function toggleTimer() {
  const t = state.timer;
  if (t.running) { t.base = getElapsed(); t.running = false; }   // congela el tiempo exacto
  else { t.startedAt = Date.now(); t.running = true; }           // reanuda desde "base"
  commit();
}
$('btnTimerToggle').addEventListener('click', toggleTimer);
$('btnTimerReset').addEventListener('click', () => {
  state.timer = { running: false, base: 0, startedAt: 0 };
  commit();
});

setInterval(() => {
  const ms = getElapsed();
  counter.setTimer(ms, state.timer.running);
  $('timerBig').textContent = DeathCounter.formatTime(ms);
}, 200);

/* ---------- Ajustes ---------- */
$('labelText').addEventListener('input', (e) => { state.labelText = e.target.value; commit(); });
$('timerLabel').addEventListener('input', (e) => { state.timerLabel = e.target.value; commit(); });
$('textColor').addEventListener('input', (e) => { state.color = e.target.value; commit(); });
$('fontSize').addEventListener('input', (e) => {
  state.size = Math.min(100, Math.max(16, parseInt(e.target.value) || 38));
  commit();
});
$('bgOpacity').addEventListener('input', (e) => {
  state.bgOpacity = parseInt(e.target.value);
  $('bgOpacityVal').textContent = `${state.bgOpacity}%`;
  commit();
});
$('animSelect').addEventListener('change', (e) => { state.animation = e.target.value; commit(); });
$('showTimer').addEventListener('change', (e) => { state.showTimer = e.target.checked; commit(); });

// Selector de posición 3x3
const POS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const POS_NAMES = { tl: 'arriba izquierda', tc: 'arriba centro', tr: 'arriba derecha', ml: 'centro izquierda', mc: 'centro',
                    mr: 'centro derecha', bl: 'abajo izquierda', bc: 'abajo centro', br: 'abajo derecha' };
const posBtns = POS.map((pos) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = b.ariaLabel = POS_NAMES[pos];
  b.addEventListener('click', () => { state.cardPos = pos; syncPos(); commit(); });
  $('posGrid').appendChild(b);
  return b;
});
const syncPos = () => posBtns.forEach((b, i) => b.classList.toggle('active', POS[i] === state.cardPos));

// Vista previa: lienzo 1920x1080 escalado al ancho disponible
const previewBox = $('previewBox');
const fitPreview = () => { $('previewRoot').style.transform = `scale(${previewBox.clientWidth / 1920})`; };
new ResizeObserver(fitPreview).observe(previewBox);

/* ---------- Atajos de teclado ---------- */
document.addEventListener('click', (e) => { e.target.closest('button')?.blur(); }); // Espacio no debe re-pulsar el botón
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); toggleTimer(); return; }
  const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
  if (n === -1) return;
  e.shiftKey ? subDeath(n) : addDeath(n);
});

/* ---------- Conexión con el overlay ---------- */
// 1) El overlay pide el estado al cargar y le respondemos.
// 2) Además reenviamos el estado cada 2 s, así el overlay se sincroniza aunque llegue tarde o reconecte.
socket.on('updateDeathState', (d) => { if (d && d.request) send(buildPayload(-1)); });
socket.on('connect', () => { setConn(true, 'Servidor conectado'); send(buildPayload(-1)); });
socket.on('disconnect', () => setConn(false, 'Sin conexión'));
socket.on('connect_error', () => setConn(false, 'No se puede conectar'));
setInterval(() => { if (socket.connected) send(buildPayload(-1)); }, 2000);

/* ---------- Inicio: refleja el estado guardado en los inputs ---------- */
state.players.forEach((p, i) => {
  rows[i].skin.value = p.skin;
  rows[i].username.value = p.custom;
  if (rows[i].enable) rows[i].enable.checked = p.enabled;
});
$('labelText').value = state.labelText;
$('timerLabel').value = state.timerLabel;
$('textColor').value = state.color;
$('fontSize').value = state.size;
$('animSelect').value = state.animation;
$('bgOpacity').value = state.bgOpacity;
$('bgOpacityVal').textContent = `${state.bgOpacity}%`;
$('showTimer').checked = state.showTimer;
syncPos();
fitPreview();
commit(-1, false); // al cargar no cuenta como cambio nuevo