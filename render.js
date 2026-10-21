/* render.js — dibuja el marcador. Lo usan control.html (vista previa) y overlay.html (OBS). */
(function () {
  const ANIMS = ['bounce', 'shake', 'pop', 'spin'];
  const skinUrl = (user) => `https://mc-heads.net/avatar/${encodeURIComponent(user)}/64`;
  const pad = (n) => String(n).padStart(2, '0');

  function formatTime(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  }

  // Calavera pixelada 8x8 (icono del total)
  const SKULL = ['01111110', '11111111', '11011011', '11011011', '11111111', '01111110', '00111100', '00101010'];
  const skullSvg = `<svg class="skull-icon" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${
    SKULL.map((row, y) => [...row].map((c, x) =>
      c === '1' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('')
  }</svg>`;

  function createCounter(root) {
    root.innerHTML = `
      <div class="overlay-stage">
        <div class="stage-item">
          <div class="scoreboard">
            <div class="sb-timer">
              <div class="sb-timer-label"><span class="timer-dot"></span><span class="timer-title"></span></div>
              <div class="timer-text">00:00:00</div>
            </div>
            <div class="sb-title"></div>
            ${[0, 1, 2].map((i) => `
              <div class="sb-row" data-i="${i}">
                <img class="mc-head-img" alt="" src="${skinUrl('Steve')}">
                <span class="sb-name"></span>
                <span class="sb-count">0</span>
              </div>`).join('')}
            <div class="sb-row sb-total">
              ${skullSvg}
              <span class="sb-name">TOTAL</span>
              <span class="sb-count">0</span>
            </div>
          </div>
        </div>
      </div>`;

    const stage = root.querySelector('.overlay-stage');
    const item = root.querySelector('.stage-item');
    const timerBox = root.querySelector('.sb-timer');
    const timerTitle = root.querySelector('.timer-title');
    const timerText = root.querySelector('.timer-text');
    const title = root.querySelector('.sb-title');
    const rows = [...root.querySelectorAll('.sb-row[data-i]')];
    const heads = rows.map((r) => r.querySelector('.mc-head-img'));
    const names = rows.map((r) => r.querySelector('.sb-name'));
    const counts = rows.map((r) => r.querySelector('.sb-count'));
    const totalRow = root.querySelector('.sb-total');
    const totalCount = totalRow.querySelector('.sb-count');
    let lastText = '';

    stage.style.visibility = 'hidden'; // oculto hasta recibir el primer estado

    function render(d) {
      stage.style.visibility = 'visible';
      stage.style.setProperty('--size', `${d.size}px`);
      stage.style.setProperty('--color', d.color);
      item.className = `stage-item pos-${d.cardPos}`;

      title.textContent = d.labelText;
      timerTitle.textContent = d.timerLabel;
      timerBox.style.display = d.showTimer ? '' : 'none';

      let total = 0, active = 0;
      d.players.forEach((p, i) => {
        rows[i].style.display = p.enabled ? '' : 'none';
        if (!p.enabled) return;
        active++;
        total += p.deaths;
        names[i].textContent = p.username;
        counts[i].textContent = p.deaths;
        if (heads[i].dataset.user !== p.username) { // evita parpadeos
          heads[i].dataset.user = p.username;
          heads[i].src = skinUrl(p.username);
        }
      });

      totalCount.textContent = total;
      totalRow.style.display = active > 1 ? '' : 'none'; // con un solo jugador el total sobra
    }

    function playAnim(i, name) {
      const row = rows[i];
      if (!row || !ANIMS.includes(name)) return;
      row.classList.remove(...ANIMS.map((a) => `anim-${a}`));
      void row.offsetWidth;
      row.classList.add(`anim-${name}`);
    }

    function setTimer(ms, running) {
      const text = formatTime(ms);
      if (text !== lastText) { timerText.textContent = text; lastText = text; }
      timerBox.classList.toggle('paused', !running);
    }

    return { render, playAnim, setTimer };
  }

  window.DeathCounter = { createCounter, formatTime, skinUrl };
})();