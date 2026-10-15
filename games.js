/* Picalta — jogos (joguinhos) */
'use strict';

/* ===== helpers ===== */
/* lista de cancelamentos (listeners, timers, RAF) por jogo */
let gameCleanups = [];
function registerGameCleanup(fn) {
  gameCleanups.push(fn);
}
function clearGameCleanup() {
  const fns = gameCleanups;
  gameCleanups = [];
  for (const fn of fns) { try { fn(); } catch (e) {} }
}
function gameBoard(id, title) {
  clearGameCleanup();
  const box = $('#game-canvas-wrap');
  box.innerHTML = `
    <div class="game-head">
      <h3>${escapeHtml(title)}</h3>
      <div class="game-stats">
        <span class="game-stat">Melhor: <b id="game-best">—</b></span>
        <span class="game-stat">Pontos: <b id="game-score">0</b></span>
        <button class="btn small ghost game-restart-btn" data-game-restart aria-label="Reiniciar o jogo (atalho R)">${window.icon ? window.icon('rotate-ccw', 16) : '↻'}<span>Reiniciar</span></button>
        <button class="btn small ghost" data-game-home>← Voltar</button>
      </div>
    </div>
    <div class="game-canvas-area" id="game-area"></div>
    <div class="game-instructions" id="game-instructions"></div>
    <div class="game-leaderboard" id="game-leaderboard"></div>
  `;
  // Devolve os nós internos: `board` para os jogos adicionarem o canvas/grelha,
  // `footer` para o texto de estado/resultado. Os jogos antigos ignoram o retorno.
  return {
    wrap: box,
    board: box.querySelector('#game-area'),
    footer: box.querySelector('#game-instructions'),
  };
}
function renderGameLeaderboard(game) {
  // dbWatchGameScores devolve a função de cancelamento diretamente (sem trabalho
  // assíncrono no caminho do onSnapshot) — ver data.js
  const unsub = dbWatchGameScores(game, async (snap) => {
    const box = $('#game-leaderboard');
    if (!box) return;
    const scores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!scores.length) { box.innerHTML = '<div class="empty">Sem pontuações ainda. Joga primeiro!</div>'; return; }
    const uids = new Set(scores.map((s) => s.uid));
    await Promise.all(Array.from(uids).map((u) => loadUser(u)));
    box.innerHTML = '<h4>Top 20</h4>' + scores.map((s, i) => {
      const u = state.usersCache[s.uid] || { username: '?' };
      return `<div class="game-score-row"><span>${i + 1}. ${escapeHtml(u.username || '?')}</span><b>${s.score}</b></div>`;
    }).join('');
  });
  registerGameCleanup(() => { try { unsub(); } catch (e) {} });
}
/* Ecrã de fim de ronda: permite jogar de novo sem recarregar a página */
function showGameOver(info) {
  const area = $('#game-area');
  if (!area || area.querySelector('.game-over')) return;
  info = info || {};
  const hasScore = typeof info.score === 'number';
  const el = document.createElement('div');
  el.className = 'game-over';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', info.title || 'Fim de jogo');
  el.innerHTML = `<div class="game-over-card">
    <span class="eyebrow">FIM DA RONDA</span>
    <h3>${escapeHtml(info.title || 'Fim de jogo')}</h3>
    ${hasScore ? `<p class="game-over-score"><b>${info.score}</b><span>${info.unit || 'pontos'}</span></p>` : ''}
    ${info.note ? `<p class="game-over-note">${escapeHtml(info.note)}</p>` : ''}
    <div class="game-over-actions">
      <button class="btn" data-game-restart id="game-again">${window.icon ? window.icon('rotate-ccw', 18) : ''}Jogar de novo</button>
      <button class="btn ghost" data-game-home>Voltar aos jogos</button>
    </div>
    <small>Atalhos: R ou Enter</small>
  </div>`;
  area.appendChild(el);
  setTimeout(() => { const b = el.querySelector('#game-again'); if (b && el.isConnected) b.focus({ preventScroll: true }); }, 60);
}
function setGameScore(n) { const el = $('#game-score'); if (el) el.textContent = n; }
function restartGame() {
  if (!state.currentGame) return;
  openGame(state.currentGame);
}
async function submitGameScore(game, score, info) {
  showGameOver(Object.assign({ title: 'Fim de jogo', score: score }, info || {}));
  try {
    await dbSaveScore(state.me.uid, game, score, {});
    toast('Pontuação guardada!');
    xpOnGameScore(game, score);
  } catch (e) {
    console.warn('[Picalta] falha ao guardar pontuação', e);
  }
}
async function unlockGameAchievement(key) {
  await unlockAchievement(key);
}

/* ===== jogo 1: Memória ===== */
function startMemoryGame() {
  const wrap = gameBoard('memory', 'Jogo da Memória');
  $('#game-instructions').textContent = 'Encontra todos os pares de emojis. Clica em duas cartas para as virar.';
  const area = $('#game-area');
  const emojis = ['🍕', '🍔', '🍓', '🍪', '🍩', '🍒', '🍌', '🍉', '🥑', '🍇'];
  const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  let flipped = [];
  let matched = 0;
  let score = 0;
  let moves = 0;
  area.innerHTML = `<div class="memory-grid" id="memory-grid">${deck.map((e, i) => `
    <button class="memory-card" data-idx="${i}" data-emoji="${e}">
      <span class="memory-front">?</span>
      <span class="memory-back">${e}</span>
    </button>`).join('')}</div>`;
  const grid = $('#memory-grid');
  const clickHandler = (e) => {
    const card = e.target.closest('.memory-card');
    if (!card || card.classList.contains('flipped') || card.classList.contains('matched')) return;
    if (flipped.length === 2) return;
    card.classList.add('flipped');
    flipped.push(card);
    if (flipped.length === 2) {
      moves++;
      const [a, b] = flipped;
      if (a.dataset.emoji === b.dataset.emoji) {
        a.classList.add('matched');
        b.classList.add('matched');
        matched++;
        score += 10;
        flipped = [];
        $('#game-score').textContent = score;
        if (matched === deck.length / 2) {
          toast('Ganhaste! 🎉');
          submitGameScore('memory', score, { title: 'Encontraste todos os pares', note: moves + ' jogadas' });
          unlockAchievement('first_memory_win');
        }
      } else {
        setTimeout(() => {
          a.classList.remove('flipped');
          b.classList.remove('flipped');
          flipped = [];
        }, 700);
      }
    }
  };
  renderGameLeaderboard('memory');
  grid.addEventListener('click', clickHandler);
  registerGameCleanup(() => {
    grid.removeEventListener('click', clickHandler);
  });
}

/* ===== jogo 2: Snake ===== */
function startSnakeGame() {
  const wrap = gameBoard('snake', 'Snake');
  $('#game-instructions').textContent = 'Setas ou WASD para mover. No telemóvel usa os botões em baixo. Come as maçãs 🍎 para crescer. Não bates nas paredes nem em ti mesmo.';
  const area = $('#game-area');
  area.innerHTML = `
    <canvas id="snake-canvas" width="360" height="360" class="snake-canvas"></canvas>
    <div class="snake-controls">
      <button class="snake-ctl" data-snake-dir="up" aria-label="cima">↑</button>
      <div>
        <button class="snake-ctl" data-snake-dir="left" aria-label="esquerda">←</button>
        <button class="snake-ctl" data-snake-dir="down" aria-label="baixo">↓</button>
        <button class="snake-ctl" data-snake-dir="right" aria-label="direita">→</button>
      </div>
    </div>`;
  const canvas = $('#snake-canvas');
  const ctx = canvas.getContext('2d');
  const GRID = 18;
  const CELL = 360 / GRID;
  let snake = [{ x: 8, y: 8 }];
  let dir = { x: 1, y: 0 };
  let food = { x: 12, y: 12 };
  let score = 0;
  let alive = true;
  let tickMs = 140;
  function spawnFood() {
    do {
      food = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }
  function step() {
    if (!alive) return;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID || snake.some((s) => s.x === head.x && s.y === head.y)) {
      alive = false;
      toast('Fim do jogo! Pontos: ' + score);
      submitGameScore('snake', score);
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++;
      $('#game-score').textContent = score;
      spawnFood();
      if (score % 5 === 0) tickMs = Math.max(70, tickMs - 10);
    } else {
      snake.pop();
    }
  }
  function draw() {
    ctx.fillStyle = '#1e1915';
    ctx.fillRect(0, 0, 360, 360);
    // comida
    ctx.font = (CELL) + 'px serif';
    ctx.textBaseline = 'top';
    ctx.fillText('🍎', food.x * CELL + 1, food.y * CELL + 1);
    // cobra
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#a97ce8' : '#6b4bbf';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }
  function setDir(d) {
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    if (map[d]) dir = map[d];
  }
  const keyHandler = (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') { setDir('up'); e.preventDefault(); }
    if (k === 'arrowdown' || k === 's') { setDir('down'); e.preventDefault(); }
    if (k === 'arrowleft' || k === 'a') { setDir('left'); e.preventDefault(); }
    if (k === 'arrowright' || k === 'd') { setDir('right'); e.preventDefault(); }
  };
  document.addEventListener('keydown', keyHandler);
  area.addEventListener('click', (e) => {
    const b = e.target.closest('[data-snake-dir]');
    if (b) setDir(b.dataset.snakeDir);
  });
  let alive2 = true;
  function loop(ts) {
    if (!alive2 || !$('#snake-canvas') || $('#snake-canvas') !== canvas) return;
    if (!alive) { return; }
    if (!loop.last) loop.last = ts;
    if (ts - loop.last >= tickMs) { loop.last = ts; step(); }
    draw();
    requestAnimationFrame(loop);
  }
  spawnFood();
  requestAnimationFrame(loop);
  renderGameLeaderboard('snake');
  registerGameCleanup(() => {
    alive2 = false;
    document.removeEventListener('keydown', keyHandler);
  });
}

/* ===== jogo 3: Picalta Fly (flappy) ===== */
function startFlappyGame() {
  const wrap = gameBoard('flappy', 'Picalta Fly');
  $('#game-instructions').textContent = 'Clica (ou carrega Espaço) para voar. Passa pelos obstáculos 🎈.';
  const area = $('#game-area');
  area.innerHTML = `<canvas id="flappy-canvas" width="360" height="480" class="flappy-canvas"></canvas>`;
  const canvas = $('#flappy-canvas');
  const ctx = canvas.getContext('2d');
  let bird = { x: 60, y: 240, vy: 0 };
  let pipes = [];
  let score = 0;
  let alive = true;
  const GRAV = 0.5;
  const JUMP = -8;
  let tick = 0;
  let started = false;
  function flap() {
    if (!alive) return;
    started = true;
    bird.vy = JUMP;
  }
  canvas.addEventListener('click', flap);
  const keyHandler = (e) => {
    if (e.code === 'Space') { flap(); e.preventDefault(); }
  };
  document.addEventListener('keydown', keyHandler);
  let alive2 = true;
  function step() {
    if (!alive2 || !alive) return;
    if (!started) { bird.y = 240 + Math.sin(Date.now() / 220) * 8; return; }
    bird.vy += GRAV;
    bird.y += bird.vy;
    if (bird.y < 0 || bird.y > 480) { alive = false; endGame(); }
    tick++;
    if (tick % 90 === 0) {
      const gap = 130;
      const top = Math.random() * (480 - gap - 80) + 40;
      pipes.push({ x: 360, top, bottom: top + gap, passed: false });
    }
    for (const p of pipes) {
      p.x -= 2.2;
      if (p.x < 60 && p.x > 10) {
        // colisão simples
        const bx = bird.x;
        const by = bird.y;
        if (by < p.top || by > p.bottom) {
          if (bx > p.x && bx < p.x + 60) { alive = false; endGame(); }
        }
      }
      if (!p.passed && p.x < 20) {
        p.passed = true;
        score++;
        $('#game-score').textContent = score;
      }
    }
    pipes = pipes.filter((p) => p.x > -70);
  }
  function endGame() {
    toast('Fim do jogo! Pontos: ' + score);
    submitGameScore('flappy', score);
  }
  function draw() {
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(0, 0, 360, 480);
    ctx.fillStyle = '#654321';
    for (const p of pipes) {
      ctx.fillRect(p.x, 0, 50, p.top);
      ctx.fillRect(p.x, p.bottom, 50, 480 - p.bottom);
    }
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, 14, 0, Math.PI * 2);
    ctx.fill();
    if (!started && alive) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Clica ou prime Espaço para começar', 180, 330); ctx.textAlign = 'start';
    }
  }
  function loop() {
    if (!alive2 || $('#flappy-canvas') !== canvas) return;
    step();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  renderGameLeaderboard('flappy');
  registerGameCleanup(() => {
    alive2 = false;
    document.removeEventListener('keydown', keyHandler);
  });
}

/* ===== jogo 4: 2048 ===== */
function start2048Game() {
  const wrap = gameBoard('g2048', '2048');
  $('#game-instructions').textContent = 'Setas, WASD ou arrastar no ecrã para mover os números. Combina-os até 2048!';
  const area = $('#game-area');
  area.innerHTML = `<div class="grid2048" id="grid2048"></div>`;
  let grid = Array(16).fill(0);
  let gameEnded = false; // finalizador idempotente
  let bestTile = 0;
  function addTile() {
    const empty = grid.map((v, i) => v === 0 ? i : -1).filter((i) => i >= 0);
    if (!empty.length) return;
    const idx = empty[Math.floor(Math.random() * empty.length)];
    grid[idx] = Math.random() < 0.9 ? 2 : 4;
  }
  function render2048() {
    const el = $('#grid2048');
    if (!el) return;
    el.innerHTML = grid.map((v, i) => `<div class="tile2048 tile-${v}">${v || ''}</div>`).join('');
  }
  function canMove() {
    // verifica se há células vazias ou pares adjacentes
    if (grid.includes(0)) return true;
    for (let i = 0; i < 16; i++) {
      if (i % 4 !== 3 && grid[i] === grid[i + 1]) return true;
      if (i < 12 && grid[i] === grid[i + 4]) return true;
    }
    return false;
  }
  function finalize2048(finalScore) {
    if (gameEnded) return;
    gameEnded = true;
    toast('Fim da partida! Pontos: ' + finalScore);
    submitGameScore('g2048', finalScore);
  }
  function slide(row) {
    const arr = row.filter((v) => v);
    const out = [];
    let gained = 0;
    for (let i = 0; i < arr.length; i++) {
      if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
        out.push(arr[i] * 2);
        gained += arr[i] * 2;
        bestTile = Math.max(bestTile, arr[i] * 2);
        i++;
      } else {
        out.push(arr[i]);
        bestTile = Math.max(bestTile, arr[i]);
      }
    }
    while (out.length < 4) out.push(0);
    return { out, gained };
  }
  function moveDir(dir) {
    if (gameEnded) return;
    let moved = false;
    let total = 0;
    for (let r = 0; r < 4; r++) {
      let row = [];
      for (let c = 0; c < 4; c++) {
        const i = dir === 'left' ? r * 4 + c : dir === 'right' ? r * 4 + (3 - c) : dir === 'up' ? c * 4 + r : (3 - c) * 4 + r;
        row.push(grid[i]);
      }
      const res = slide(row);
      if (res.out.join(',') !== row.join(',')) moved = true;
      total += res.gained;
      for (let c = 0; c < 4; c++) {
        const i = dir === 'left' ? r * 4 + c : dir === 'right' ? r * 4 + (3 - c) : dir === 'up' ? c * 4 + r : (3 - c) * 4 + r;
        grid[i] = res.out[c];
      }
    }
    if (moved) {
      addTile();
      render2048();
      const cur = parseInt($('#game-score').textContent) || 0;
      const newScore = cur + total;
      $('#game-score').textContent = newScore;
      if (bestTile >= 2048 && !gameEnded) {
        finalize2048(newScore);
        unlockAchievement('reached_2048');
        return; // para de processar movimentos após vitória
      }
      if (!canMove()) {
        finalize2048(newScore);
      }
    }
  }
  const keyHandler = (e) => {
    if (!$('#grid2048')) return;
    const k = e.key.toLowerCase();
    const map = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
    if (map[k]) { moveDir(map[k]); e.preventDefault(); }
  };
  document.addEventListener('keydown', keyHandler);
  let sx = 0, sy = 0;
  const touchStart = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  const touchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 30) moveDir('right');
      else if (dx < -30) moveDir('left');
    } else {
      if (dy > 30) moveDir('down');
      else if (dy < -30) moveDir('up');
    }
  };
  area.addEventListener('touchstart', touchStart);
  area.addEventListener('touchend', touchEnd);
  addTile();
  addTile();
  render2048();
  renderGameLeaderboard('g2048');
  registerGameCleanup(() => {
    document.removeEventListener('keydown', keyHandler);
    area.removeEventListener('touchstart', touchStart);
    area.removeEventListener('touchend', touchEnd);
    // guarda partida se não acabou formalmente (ex.: sair a meio)
    if (!gameEnded) {
      const cur = parseInt($('#game-score').textContent) || 0;
      if (cur > 0) finalize2048(cur);
    }
  });
}

/* ===== jogo 5: Galo (tictactoe) ===== */
function startTictactoeGame() {
  const wrap = gameBoard('tictactoe', 'Galo');
  $('#game-instructions').textContent = 'Tu jogas com X. Tenta fazer linha antes do computador!';
  const area = $('#game-area');
  area.innerHTML = `<div class="ttt-grid" id="ttt-grid"></div>`;
  let board = Array(9).fill(null);
  let over = false;
  let sessionWins = window.__tttWins || 0;
  setGameScore(sessionWins);
  const WIN = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function checkWin(b) {
    for (const [a, c, d] of WIN) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return null;
  }
  function aiMove() {
    // simples: ganhar se possível, senão bloquear, senão aleatório
    const empty = board.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
    for (const m of empty) {
      const b = [...board]; b[m] = 'O';
      if (checkWin(b) === 'O') { board = b; return; }
    }
    for (const m of empty) {
      const b = [...board]; b[m] = 'X';
      if (checkWin(b) === 'X') { b[m] = 'O'; board = b; return; }
    }
    const pick = empty[Math.floor(Math.random() * empty.length)];
    if (pick >= 0) board[pick] = 'O';
  }
  function renderTTT() {
    const el = $('#ttt-grid');
    if (!el) return;
    el.innerHTML = board.map((v, i) => `<button class="ttt-cell ${v || ''}" data-ttt="${i}">${v || ''}</button>`).join('');
  }
  const clickHandler = (e) => {
    const cell = e.target.closest('[data-ttt]');
    if (!cell || over || board[parseInt(cell.dataset.ttt)]) return;
    const idx = parseInt(cell.dataset.ttt);
    board[idx] = 'X';
    if (checkWin(board) === 'X') {
      over = true;
      renderTTT();
      toast('Ganhaste! 🎉');
      sessionWins++;
      window.__tttWins = sessionWins;
      $('#game-score').textContent = sessionWins;
      submitGameScore('tictactoe', sessionWins, { title: 'Ganhaste', unit: sessionWins === 1 ? 'vitória' : 'vitórias' });
      unlockAchievement('beat_tictactoe_ai');
      return;
    }
    aiMove();
    if (checkWin(board) === 'O') {
      over = true;
      renderTTT();
      toast('O computador ganhou. Tenta outra vez!');
      showGameOver({ title: 'O computador ganhou', score: sessionWins, unit: sessionWins === 1 ? 'vitória' : 'vitórias' });
      return;
    }
    if (board.every(Boolean)) { over = true; renderTTT(); toast('Empate!'); showGameOver({ title: 'Empate', score: sessionWins, unit: sessionWins === 1 ? 'vitória' : 'vitórias' }); return; }
    renderTTT();
  };
  area.addEventListener('click', clickHandler);
  renderTTT();
  renderGameLeaderboard('tictactoe');
  registerGameCleanup(() => {
    area.removeEventListener('click', clickHandler);
  });
}

/* ===== jogo 6: Teste de escrita ===== */
const TYPING_TEXTS = [
  'O Picalta é uma rede social de fotos com conversas em tempo real.',
  'Escreve rápido e sem erros para ganhares pontos neste teste.',
  'A persistência é o caminho do êxito em qualquer projeto que faças.',
  'As fotos contam histórias e as conversas aproximam as pessoas.',
  'Nunca desistas dos teus sonhos mesmo quando o caminho é difícil.',
];
function startTypingGame() {
  const wrap = gameBoard('typing', 'Teste de Escrita');
  $('#game-instructions').textContent = 'Escreve o texto abaixo o mais rápido e correto possível. 60 segundos.';
  const area = $('#game-area');
  const target = TYPING_TEXTS[Math.floor(Math.random() * TYPING_TEXTS.length)];
  let typed = '';
  let started = false;
  let errors = 0;
  let finished = false;
  area.innerHTML = `
    <div class="typing-target">${escapeHtml(target)}</div>
    <textarea class="typing-input" id="typing-input" placeholder="Começa a escrever aqui…" rows="4"></textarea>
    <div class="typing-timer" id="typing-timer">60s</div>
  `;
  const input = $('#typing-input');
  const timerEl = $('#typing-timer');
  let timer = null;
  function endTyping() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    input.disabled = true;
    const wpm = typed.trim().split(/\s+/).filter(Boolean).length;
    const acc = typed.length ? Math.max(0, Math.round((typed.length - errors) / typed.length * 100)) : 0;
    const score = Math.round(wpm * acc / 100);
    $('#game-score').textContent = score;
    toast(`Fim! ${wpm} palavras/min, ${acc}% precisão. Pontos: ${score}`);
    submitGameScore('typing', score);
    unlockAchievement('completed_typing_test');
  }
  const inputHandler = () => {
    if (finished) return;
    if (!started) {
      started = true;
      let left = 60;
      timer = setInterval(() => {
        left--;
        const el = $('#typing-timer');
        if (el) el.textContent = left + 's';
        if (left <= 0) endTyping();
      }, 1000);
    }
    typed = input.value;
    // conta erros simples (caracteres diferentes)
    errors = 0;
    for (let i = 0; i < typed.length; i++) {
      if (typed[i] !== target[i]) errors++;
    }
  };
  input.addEventListener('input', inputHandler);
  input.focus();
  renderGameLeaderboard('typing');
  registerGameCleanup(() => {
    input.removeEventListener('input', inputHandler);
    if (timer) clearInterval(timer);
    if (!finished) {
      const wpm = typed.trim().split(/\s+/).filter(Boolean).length;
      const acc = typed.length ? Math.max(0, Math.round((typed.length - errors) / typed.length * 100)) : 0;
      const score = Math.round(wpm * acc / 100);
      if (score > 0) {
        finished = true;
        submitGameScore('typing', score);
      }
    }
  });
}

/* ===== router de jogos ===== */
function openGame(game) {
  if (!state.me) return;
  clearGameCleanup();
  $('#games-home').style.display = 'none';
  $('#game-canvas-wrap').style.display = '';
  state.currentGame = game;
  window.__lastGame = game;
  switch (game) {
    case 'memory': startMemoryGame(); break;
    case 'snake': startSnakeGame(); break;
    case 'flappy': startFlappyGame(); break;
    case 'g2048': start2048Game(); break;
    case 'tictactoe': startTictactoeGame(); break;
    case 'typing': startTypingGame(); break;
    case 'minesweeper': startMinesweeperGame(); break;
    case 'breakout': startBreakoutGame(); break;
    case 'mines': startMinesGame(); break;
    case 'tetris': startTetrisGame(); break;
    case 'pong': startPongGame(); break;
    case 'connect4': startConnect4Game(); break;
    default:
      if (window.PICALTA_EXTRA_GAMES && window.PICALTA_EXTRA_GAMES[game]) window.PICALTA_EXTRA_GAMES[game]();
  }
  // guarda melhor pontuação atual
  dbGetPlayer(state.me.uid).then((p) => {
    const b = $('#game-best');
    if (b) b.textContent = (p && p['best_' + game] != null) ? p['best_' + game] : '—';
  });
}
function closeGame() {
  clearGameCleanup();
  window.__tttWins = 0;
  state.currentGame = null;
  $('#games-home').style.display = '';
  $('#game-canvas-wrap').style.display = 'none';
  $('#game-canvas-wrap').innerHTML = '';
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-open-game]');
  if (g) { e.preventDefault(); openGame(g.dataset.openGame); return; }
  const gf = e.target.closest('[data-game-filter]');
  if (gf) { window.__gameFilter = gf.dataset.gameFilter; renderGamesHome(); return; }
  if (e.target.closest('[data-game-random]')) { const ks = Object.keys(GAMES); openGame(ks[Math.floor(Math.random() * ks.length)]); return; }
  if (e.target.closest('[data-game-restart]')) { e.preventDefault(); restartGame(); return; }
  if (e.target.closest('[data-game-home]')) { closeGame(); renderGamesHome(); return; }
});
document.addEventListener('keydown', (e) => {
  if (!state.currentGame || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = document.activeElement;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const over = !!document.querySelector('#game-area .game-over');
  const k = e.key.toLowerCase();
  // Na Palavra do Dia o R é uma letra: lá só reinicia com o ecrã de fim de ronda.
  if ((k === 'r' && (over || state.currentGame !== 'wordle')) || (k === 'enter' && over)) { e.preventDefault(); restartGame(); }
});
const GAME_CATS = [['all', 'Todos'], ['arcade', 'Arcada'], ['puzzle', 'Puzzle'], ['duelo', 'Contra a IA'], ['reflexos', 'Reflexos']];
function renderGamesHome() {
  const box = $('#games-home');
  if (!box) return;
  const filter = window.__gameFilter || 'all';
  const last = window.__lastGame || null;
  const best = (k) => (state.player && typeof state.player['best_' + k] === 'number') ? state.player['best_' + k] : null;
  const records = Object.keys(GAMES).filter((k) => best(k) !== null).length;
  const list = Object.entries(GAMES).filter(([, g]) => filter === 'all' || g.cat === filter);
  box.innerHTML = `
    <div class="games-toolbar">
      <div class="games-chips" role="tablist" aria-label="Categorias">${GAME_CATS.map(([k, l]) => `<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'active' : ''}" data-game-filter="${k}">${l}</button>`).join('')}</div>
      <div class="games-quick">
        ${last && GAMES[last] ? `<button class="btn small ghost" data-open-game="${last}">Continuar: ${escapeHtml(GAMES[last].label)}</button>` : ''}
        <button class="btn small" data-game-random>${window.icon ? window.icon('shuffle', 16) : ''}Surpreende-me</button>
      </div>
    </div>
    <p class="games-summary">${Object.keys(GAMES).length} jogos · ${records} ${records === 1 ? 'recorde teu' : 'recordes teus'}</p>
    <div class="games-grid">
      ${list.map(([k, g]) => `
        <button class="game-card" data-open-game="${k}">
          <span class="game-icon">${g.icon}</span>
          <span class="game-title">${escapeHtml(g.label)}</span>
          <small class="game-best">${best(k) !== null ? 'Melhor: ' + best(k) : g.hint || 'Joga agora'}</small>
        </button>`).join('')}
    </div>
    <div class="games-leaderboard">
      <h3>🏆 Ranking global (XP)</h3>
      <div id="global-leaderboard"></div>
    </div>
  `;
  if (window.__lbUnsub) { try { window.__lbUnsub(); } catch (e) { /* já terminado */ } }
  window.__lbUnsub = dbWatchLeaderboard(async (snap) => {
    const box2 = $('#global-leaderboard');
    if (!box2) return;
    const players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!players.length) { box2.innerHTML = '<div class="empty">Ainda ninguém tem XP. Joga para ganhar!</div>'; return; }
    const uids = new Set(players.map((p) => p.uid || p.id));
    await Promise.all(Array.from(uids).map((u) => loadUser(u)));
    box2.innerHTML = players.slice(0, 20).map((p, i) => {
      const u = state.usersCache[p.uid || p.id] || { username: '?' };
      const lvl = p.level || 1;
      return `<div class="game-score-row"><span>${i + 1}. ${escapeHtml(u.username || '?')} <em class="lvl">Lv ${lvl}</em></span><b>${p.xp || 0} XP</b></div>`;
    }).join('');
  });
}

/* ===== Minesweeper ===== */
function startMinesweeperGame() {
  const { board, footer } = gameBoard('minesweeper', '💣 Campo Minado');
  footer.textContent = 'Clica para revelar. Botão direito (ou toque longo) para marcar uma bandeira. A primeira jogada é sempre segura.';
  const SIZE = 9, MINES = 10;
  let grid = [], revealed = 0, over = false, flags = 0, first = true, pressTimer = null;
  function countAround(r, c) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && grid[nr][nc].mine) n++;
    }
    return n;
  }
  function recount() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) grid[r][c].n = countAround(r, c);
  }
  function init() {
    grid = [];
    for (let r = 0; r < SIZE; r++) {
      grid.push([]);
      for (let c = 0; c < SIZE; c++) grid[r].push({ mine: false, revealed: false, flagged: false, n: 0 });
    }
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * SIZE), c = Math.floor(Math.random() * SIZE);
      if (!grid[r][c].mine) { grid[r][c].mine = true; placed++; }
    }
    recount();
    revealed = 0; over = false; flags = 0; first = true;
    setGameScore(0);
    render();
  }
  function moveMineAway(r, c) {
    grid[r][c].mine = false;
    for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) {
      if (!grid[rr][cc].mine && !(rr === r && cc === c)) { grid[rr][cc].mine = true; recount(); return; }
    }
  }
  function reveal(r, c) {
    if (over || grid[r][c].revealed || grid[r][c].flagged) return;
    if (first) { first = false; if (grid[r][c].mine) moveMineAway(r, c); }
    grid[r][c].revealed = true;
    revealed++;
    if (grid[r][c].mine) {
      over = true;
      footer.textContent = 'Pisaste uma mina.';
      revealAll();
      render();
      submitGameScore('minesweeper', Math.max(0, revealed - 1), { title: 'Pisaste uma mina', note: 'Revelaste ' + Math.max(0, revealed - 1) + ' de ' + (SIZE * SIZE - MINES) + ' casas seguras.' });
      return;
    }
    if (grid[r][c].n === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) reveal(nr, nc);
      }
    }
    setGameScore(revealed);
    if (!over && revealed >= SIZE * SIZE - MINES) {
      over = true;
      footer.textContent = 'Limpaste o campo.';
      render();
      submitGameScore('minesweeper', SIZE * SIZE - MINES, { title: 'Limpaste o campo' });
      unlockGameAchievement('minesweeper_win');
      return;
    }
    render();
  }
  function toggleFlag(r, c) {
    const cell = grid[r][c];
    if (over || cell.revealed) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    render();
  }
  function revealAll() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (grid[r][c].mine) grid[r][c].revealed = true;
  }
  function render() {
    const over0 = board.querySelector('.game-over');
    board.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'ms-bar';
    bar.innerHTML = `<span>Minas: <b>${MINES - flags}</b></span>`;
    board.appendChild(bar);
    const tbl = document.createElement('table');
    tbl.className = 'minesweeper-table';
    for (let r = 0; r < SIZE; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < SIZE; c++) {
        const td = document.createElement('td');
        const cell = grid[r][c];
        td.className = 'ms-cell' + (cell.revealed ? ' revealed' : '') + (cell.revealed && !cell.mine && cell.n ? ' n' + cell.n : '');
        td.textContent = cell.revealed ? (cell.mine ? '💣' : (cell.n || '')) : (cell.flagged ? '🚩' : '');
        td.onclick = () => reveal(r, c);
        td.oncontextmenu = (e) => { e.preventDefault(); toggleFlag(r, c); };
        td.ontouchstart = () => { pressTimer = setTimeout(() => { pressTimer = 'fired'; toggleFlag(r, c); }, 450); };
        td.ontouchend = (e) => { if (pressTimer === 'fired') e.preventDefault(); clearTimeout(pressTimer); pressTimer = null; };
        td.ontouchmove = () => { clearTimeout(pressTimer); pressTimer = null; };
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    board.appendChild(tbl);
    if (over0) board.appendChild(over0);
  }
  renderGameLeaderboard('minesweeper');
  registerGameCleanup(() => clearTimeout(pressTimer));
  init();
}

/* ===== Breakout ===== */
function startBreakoutGame() {
  const { board, footer } = gameBoard('breakout', '🧱 Breakout');
  footer.textContent = 'Move o rato ou o dedo (ou usa as setas ← →) para mexer a raquete. Tens 3 vidas.';
  const W = 400, H = 500, PADDLE_W = 80, BALL_R = 8;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'game-canvas';
  board.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let paddleX = W / 2, ballX = W / 2, ballY = H - 40;
  let dx = 3, dy = -3, score = 0, lives = 3, running = true, left = false, right = false, last = 0;
  const bricks = [];
  const BRICK_ROWS = 5, BRICK_COLS = 8, BRICK_W = 46, BRICK_H = 20, BRICK_PAD = 4, BRICK_TOP = 60;
  const rowColors = ['#c0392b', '#d98324', '#c9a227', '#3f8f5a', '#672ea4'];
  for (let r = 0; r < BRICK_ROWS; r++) for (let c = 0; c < BRICK_COLS; c++) bricks.push({ x: 10 + c * (BRICK_W + BRICK_PAD), y: BRICK_TOP + r * (BRICK_H + BRICK_PAD), alive: true, color: rowColors[r] });
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, (e.clientX - rect.left) * (W / rect.width)));
  };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, (e.touches[0].clientX - rect.left) * (W / rect.width)));
  };
  const keyDown = (e) => { if (e.key === 'ArrowLeft') { left = true; e.preventDefault(); } if (e.key === 'ArrowRight') { right = true; e.preventDefault(); } };
  const keyUp = (e) => { if (e.key === 'ArrowLeft') left = false; if (e.key === 'ArrowRight') right = false; };
  document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp);
  const fg = () => getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#222';
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const b of bricks) if (b.alive) { ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H); }
    ctx.fillStyle = '#672ea4';
    ctx.fillRect(paddleX - PADDLE_W / 2, H - 20, PADDLE_W, 12);
    ctx.beginPath(); ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2); ctx.fillStyle = fg(); ctx.fill();
    ctx.fillStyle = fg(); ctx.font = '600 14px sans-serif';
    ctx.fillText('Vidas: ' + lives, 10, 22);
    ctx.fillText('Pontos: ' + score, W - 100, 22);
  }
  function finish(win) {
    running = false;
    submitGameScore('breakout', score, { title: win ? 'Limpaste todos os blocos' : 'Ficaste sem vidas' });
  }
  function step(ts) {
    if (!running) return;
    const dt = Math.min(2.2, (ts - (last || ts)) / 16.667 || 1); last = ts;
    if (left) paddleX = Math.max(PADDLE_W / 2, paddleX - 6 * dt);
    if (right) paddleX = Math.min(W - PADDLE_W / 2, paddleX + 6 * dt);
    ballX += dx * dt; ballY += dy * dt;
    if (ballX < BALL_R) { ballX = BALL_R; dx = Math.abs(dx); }
    if (ballX > W - BALL_R) { ballX = W - BALL_R; dx = -Math.abs(dx); }
    if (ballY < BALL_R) { ballY = BALL_R; dy = Math.abs(dy); }
    if (ballY > H - 20 - BALL_R && ballY < H - 6 && dy > 0 && Math.abs(ballX - paddleX) < PADDLE_W / 2 + BALL_R) {
      dy = -Math.abs(dy);
      dx = ((ballX - paddleX) / (PADDLE_W / 2)) * 4.2;
    }
    if (ballY > H) {
      lives--;
      if (lives <= 0) { draw(); finish(false); return; }
      ballX = W / 2; ballY = H - 40; dx = 3; dy = -3;
    }
    for (const b of bricks) {
      if (b.alive && ballX > b.x - BALL_R && ballX < b.x + BRICK_W + BALL_R && ballY > b.y - BALL_R && ballY < b.y + BRICK_H + BALL_R) {
        b.alive = false;
        score += 10;
        setGameScore(score);
        dy = -dy;
        if (bricks.every((x) => !x.alive)) { draw(); finish(true); return; }
        break;
      }
    }
    draw();
    requestAnimationFrame(step);
  }
  setGameScore(0);
  renderGameLeaderboard('breakout');
  draw();
  requestAnimationFrame(step);
  registerGameCleanup(() => { running = false; document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp); });
}

/* ===== Campo Minado (alias) ===== */
function startMinesGame() { startMinesweeperGame(); }

/* ===== Tetris ===== */
function startTetrisGame() {
  const { board, footer } = gameBoard('tetris', '🧩 Tetris');
  footer.textContent = 'Setas para mover, ↑ para rodar, Espaço para largar a peça. No telemóvel usa os botões.';
  const W = 300, H = 600, CELL = 30;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'game-canvas tetris-canvas';
  board.appendChild(canvas);
  const pad = document.createElement('div');
  pad.className = 'touch-pad';
  pad.innerHTML = `<button data-t="left" aria-label="Esquerda">←</button><button data-t="rotate" aria-label="Rodar">⟳</button><button data-t="right" aria-label="Direita">→</button><button data-t="down" aria-label="Descer">↓</button><button data-t="drop" aria-label="Largar">⤓</button>`;
  board.appendChild(pad);
  const ctx = canvas.getContext('2d');
  const COLS = W / CELL, ROWS = H / CELL;
  let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const SHAPES = [
    [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]], [[0,1,1],[1,1,0]], [[1,1,0],[0,1,1]],
  ];
  const COLORS = ['#00a3b8', '#e6c200', '#9c27b0', '#e8590c', '#3f51b5', '#2f9e44', '#e03131'];
  let cur = null, curColor = 0, curX = 0, curY = 0, score = 0, lines = 0, over = false, running = true;
  let dropCounter = 0, lastTime = 0;
  const interval = () => Math.max(110, 520 - Math.floor(lines / 5) * 45);
  function collide(x, y, shape) {
    for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const nx = x + c, ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }
  function newPiece() {
    const idx = Math.floor(Math.random() * SHAPES.length);
    cur = SHAPES[idx]; curColor = idx + 1;
    curX = Math.floor((COLS - cur[0].length) / 2); curY = 0;
    if (collide(curX, curY, cur)) {
      over = true; running = false; draw();
      submitGameScore('tetris', score, { title: 'A pilha chegou ao topo', note: lines + ' linhas completas' });
    }
  }
  function merge() {
    for (let r = 0; r < cur.length; r++) for (let c = 0; c < cur[r].length; c++) {
      if (cur[r][c]) { const ny = curY + r; if (ny >= 0) grid[ny][curX + c] = curColor; }
    }
  }
  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r].every((x) => x)) { grid.splice(r, 1); grid.unshift(Array(COLS).fill(0)); cleared++; r++; }
    }
    if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared] || 800; setGameScore(score); }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(128,128,128,0.18)';
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke(); }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(W, j * CELL); ctx.stroke(); }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) { ctx.fillStyle = COLORS[grid[r][c] - 1] || '#888'; ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2); }
    }
    if (cur && !over) {
      let gy = curY; while (!collide(curX, gy + 1, cur)) gy++;
      ctx.globalAlpha = 0.22; ctx.fillStyle = COLORS[curColor - 1];
      for (let r = 0; r < cur.length; r++) for (let c = 0; c < cur[r].length; c++) if (cur[r][c]) ctx.fillRect((curX + c) * CELL + 1, (gy + r) * CELL + 1, CELL - 2, CELL - 2);
      ctx.globalAlpha = 1; ctx.fillStyle = COLORS[curColor - 1];
      for (let r = 0; r < cur.length; r++) for (let c = 0; c < cur[r].length; c++) if (cur[r][c]) ctx.fillRect((curX + c) * CELL + 1, (curY + r) * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  function lock() { merge(); clearLines(); newPiece(); dropCounter = 0; }
  function loop(ts) {
    if (over || !running) return;
    dropCounter += ts - (lastTime || ts); lastTime = ts;
    if (dropCounter > interval()) {
      dropCounter = 0;
      if (!collide(curX, curY + 1, cur)) curY++; else lock();
    }
    draw();
    requestAnimationFrame(loop);
  }
  function act(a) {
    if (over || !running || !cur) return;
    if (a === 'left' && !collide(curX - 1, curY, cur)) curX--;
    else if (a === 'right' && !collide(curX + 1, curY, cur)) curX++;
    else if (a === 'down') { if (!collide(curX, curY + 1, cur)) { curY++; score += 1; setGameScore(score); } }
    else if (a === 'rotate') {
      const rotated = cur[0].map((_, i) => cur.map((row) => row[i]).reverse());
      for (const kick of [0, -1, 1, -2, 2]) if (!collide(curX + kick, curY, rotated)) { cur = rotated; curX += kick; break; }
    } else if (a === 'drop') { while (!collide(curX, curY + 1, cur)) { curY++; score += 2; } setGameScore(score); lock(); }
    draw();
  }
  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };
  const onKey = (e) => {
    if (state.currentGame !== 'tetris' || !keys[e.key]) return;
    e.preventDefault(); act(keys[e.key]);
  };
  document.addEventListener('keydown', onKey);
  pad.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) act(b.dataset.t); });
  setGameScore(0);
  renderGameLeaderboard('tetris');
  newPiece();
  requestAnimationFrame(loop);
  registerGameCleanup(() => { running = false; document.removeEventListener('keydown', onKey); });
}

/* ===== Pong ===== */
function startPongGame() {
  const { board, footer } = gameBoard('pong', '🏓 Pong');
  footer.textContent = 'Move o rato ou o dedo para cima e para baixo (ou usa ↑ ↓). Primeiro a 5 ganha.';
  const W = 500, H = 300;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'game-canvas';
  board.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const PW = 10, PH = 60, BALL_R = 6;
  let p1Y = H / 2, p2Y = H / 2, bx = W / 2, by = H / 2;
  let vx = 3.2, vy = 2, p1Score = 0, p2Score = 0, running = true, up = false, down = false, last = 0;
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    p1Y = Math.max(PH / 2, Math.min(H - PH / 2, (e.clientY - rect.top) * (H / rect.height)));
  };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    p1Y = Math.max(PH / 2, Math.min(H - PH / 2, (e.touches[0].clientY - rect.top) * (H / rect.height)));
  };
  const keyDown = (e) => { if (e.key === 'ArrowUp') { up = true; e.preventDefault(); } if (e.key === 'ArrowDown') { down = true; e.preventDefault(); } };
  const keyUp = (e) => { if (e.key === 'ArrowUp') up = false; if (e.key === 'ArrowDown') down = false; };
  document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp);
  function reset(dir) {
    bx = W / 2; by = H / 2; vx = 3.2 * dir; vy = (Math.random() - 0.5) * 4;
    setGameScore(p1Score);
    if (p1Score >= 5 || p2Score >= 5) {
      running = false;
      draw();
      submitGameScore('pong', p1Score, { title: p1Score > p2Score ? 'Ganhaste ' + p1Score + ' - ' + p2Score : 'Perdeste ' + p1Score + ' - ' + p2Score, unit: p1Score === 1 ? 'ponto' : 'pontos' });
    }
  }
  function step(ts) {
    if (!running) return;
    const dt = Math.min(2.2, (ts - (last || ts)) / 16.667 || 1); last = ts;
    if (up) p1Y = Math.max(PH / 2, p1Y - 5 * dt);
    if (down) p1Y = Math.min(H - PH / 2, p1Y + 5 * dt);
    bx += vx * dt; by += vy * dt;
    if (by < BALL_R) { by = BALL_R; vy = Math.abs(vy); }
    if (by > H - BALL_R) { by = H - BALL_R; vy = -Math.abs(vy); }
    if (vx < 0 && bx < 20 + PW + BALL_R && bx > 10 && Math.abs(by - p1Y) < PH / 2 + BALL_R) { vx = Math.min(8, Math.abs(vx) * 1.06); vy += (by - p1Y) / 9; }
    if (vx > 0 && bx > W - 20 - PW - BALL_R && bx < W - 10 && Math.abs(by - p2Y) < PH / 2 + BALL_R) { vx = -Math.min(8, Math.abs(vx) * 1.06); vy += (by - p2Y) / 9; }
    vy = Math.max(-6, Math.min(6, vy));
    p2Y += Math.max(-3.2 * dt, Math.min(3.2 * dt, (by - p2Y) * 0.2));
    p2Y = Math.max(PH / 2, Math.min(H - PH / 2, p2Y));
    if (bx < 0) { p2Score++; reset(1); }
    else if (bx > W) { p1Score++; reset(-1); }
    draw();
    if (running) requestAnimationFrame(step);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#222';
    ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(128,128,128,.4)'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#672ea4';
    ctx.fillRect(10, p1Y - PH / 2, PW, PH);
    ctx.fillStyle = '#b3365b';
    ctx.fillRect(W - 10 - PW, p2Y - PH / 2, PW, PH);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 22px sans-serif'; ctx.fillStyle = 'rgba(128,128,128,.9)';
    ctx.fillText(String(p1Score), W / 2 - 40, 32);
    ctx.fillText(String(p2Score), W / 2 + 24, 32);
  }
  setGameScore(0);
  renderGameLeaderboard('pong');
  draw();
  requestAnimationFrame(step);
  registerGameCleanup(() => { running = false; document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp); });
}

/* ===== 4 em Linha ===== */
function startConnect4Game() {
  const { board, footer } = gameBoard('connect4', '🔴 4 em Linha');
  footer.textContent = 'Tu jogas com as peças roxas. Liga quatro na horizontal, vertical ou diagonal.';
  const COLS = 7, ROWS = 6;
  let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let turn = 1, over = false, aiTimer = null, wins = window.__c4Wins || 0, winCells = [];
  setGameScore(wins);
  function lineFrom(r, c, g) {
    const p = g[r][c];
    if (!p) return null;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [[r, c]];
      for (const sign of [1, -1]) for (let d = 1; d <= 3; d++) {
        const nr = r + dr * d * sign, nc = c + dc * d * sign;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || g[nr][nc] !== p) break;
        cells.push([nr, nc]);
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }
  const rowFor = (g, col) => { for (let r = ROWS - 1; r >= 0; r--) if (!g[r][col]) return r; return -1; };
  function finish(winner) {
    over = true;
    if (winner === 1) { wins++; window.__c4Wins = wins; setGameScore(wins); }
    render();
    const title = winner === 1 ? 'Ganhaste' : winner === 2 ? 'A IA ganhou' : 'Empate';
    submitGameScore('connect4', wins, { title, unit: wins === 1 ? 'vitória' : 'vitórias' });
  }
  function place(col, player) {
    const r = rowFor(grid, col);
    if (r < 0) return false;
    grid[r][col] = player;
    const line = lineFrom(r, col, grid);
    if (line) { winCells = line; finish(player); return true; }
    if (grid[0].every(Boolean)) { finish(0); return true; }
    return true;
  }
  function drop(col) {
    if (over || turn !== 1) return;
    if (!place(col, 1)) { toast('Essa coluna está cheia.'); return; }
    if (over) return;
    turn = 2; render();
    aiTimer = setTimeout(aiMove, 420);
  }
  function aiMove() {
    if (over) return;
    const valid = []; for (let c = 0; c < COLS; c++) if (rowFor(grid, c) >= 0) valid.push(c);
    const wouldWin = (c, p) => { const r = rowFor(grid, c); grid[r][c] = p; const w = !!lineFrom(r, c, grid); grid[r][c] = 0; return w; };
    let col = valid.find((c) => wouldWin(c, 2));
    if (col === undefined) col = valid.find((c) => wouldWin(c, 1));
    if (col === undefined) {
      const safe = valid.filter((c) => { const r = rowFor(grid, c); if (r - 1 < 0) return true; grid[r][c] = 2; const bad = wouldWin(c, 1); grid[r][c] = 0; return !bad; });
      const pool = safe.length ? safe : valid;
      pool.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) + (Math.random() - 0.5) * 1.6);
      col = pool[0];
    }
    place(col, 2);
    if (!over) { turn = 1; render(); }
  }
  function render() {
    const over0 = board.querySelector('.game-over');
    board.innerHTML = '';
    const status = document.createElement('div');
    status.className = 'c4-status';
    status.textContent = over ? '' : turn === 1 ? 'A tua vez' : 'A IA está a pensar…';
    board.appendChild(status);
    const tbl = document.createElement('table');
    tbl.className = 'connect4-table';
    for (let r = 0; r < ROWS; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < COLS; c++) {
        const td = document.createElement('td');
        td.className = 'c4-cell' + (grid[r][c] === 1 ? ' p1' : grid[r][c] === 2 ? ' p2' : '') + (winCells.some(([a, b]) => a === r && b === c) ? ' win' : '');
        td.onclick = () => drop(c);
        td.setAttribute('role', 'button');
        td.setAttribute('aria-label', 'Largar peça na coluna ' + (c + 1));
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    board.appendChild(tbl);
    if (over0) board.appendChild(over0);
  }
  renderGameLeaderboard('connect4');
  registerGameCleanup(() => clearTimeout(aiTimer));
  render();
}
