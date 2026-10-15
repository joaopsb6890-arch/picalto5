/* Picalta — jogos adicionais: Sequência, Toupeiras, Reflexos, Puzzle 15 e Palavra do Dia.
   Carrega depois de games.js e regista-se em window.PICALTA_EXTRA_GAMES. */
(function () {
  'use strict';
  Object.assign(GAMES, {
    simon: { label: 'Sequência', icon: '🎵', cat: 'reflexos', hint: 'Repete a ordem' },
    whack: { label: 'Toupeiras', icon: '🔨', cat: 'reflexos', hint: '30 segundos' },
    reaction: { label: 'Reflexos', icon: '⚡', cat: 'reflexos', hint: 'Cinco rondas' },
    sliding: { label: 'Puzzle 15', icon: '🧮', cat: 'puzzle', hint: 'Ordena os números' },
    wordle: { label: 'Palavra do Dia', icon: '🔤', cat: 'puzzle', hint: 'Seis tentativas' },
  });

  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); };
  const alive = (id) => state.currentGame === id;

  /* ---------- Sequência (Simon) ---------- */
  function startSimon() {
    const { board, footer } = gameBoard('simon', '🎵 Sequência');
    footer.textContent = 'Observa a sequência de luzes e repete-a pela mesma ordem. Cada ronda acrescenta uma cor. Também podes usar 1, 2, 3 e 4.';
    const names = ['Roxo', 'Rosa', 'Verde', 'Dourado'];
    const freq = [262, 330, 392, 523];
    board.innerHTML = `<div class="simon-status" id="simon-status" aria-live="polite">Prepara-te…</div>
      <div class="simon-grid">${names.map((n, i) => `<button class="simon-pad simon-${i}" data-simon="${i}" aria-label="${n}"><span>${i + 1}</span></button>`).join('')}</div>`;
    const status = $('#simon-status');
    const pads = [...board.querySelectorAll('.simon-pad')];
    let seq = [], pos = 0, accepting = false, ac = null, over = false;
    const tone = (i) => {
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = freq[i];
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.32);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.35);
      } catch (e) { /* sem áudio */ }
    };
    const flash = (i, ms) => { pads[i].classList.add('lit'); tone(i); later(() => pads[i].classList.remove('lit'), ms || 320); };
    function playSeq() {
      accepting = false; pos = 0;
      status.textContent = 'Observa…';
      const gap = Math.max(260, 560 - seq.length * 18);
      seq.forEach((c, k) => later(() => { if (alive('simon')) flash(c, gap - 120); }, 700 + k * gap));
      later(() => { if (!alive('simon')) return; accepting = true; status.textContent = 'A tua vez'; }, 700 + seq.length * gap);
    }
    function next() { seq.push(Math.floor(Math.random() * 4)); setGameScore(seq.length - 1); playSeq(); }
    function press(i) {
      if (!accepting || over) return;
      flash(i, 220);
      if (seq[pos] !== i) {
        over = true; accepting = false;
        status.textContent = 'Errado';
        pads.forEach((p) => p.classList.add('wrong'));
        const rounds = seq.length - 1;
        later(() => submitGameScore('simon', rounds, { title: 'Falhaste a sequência', unit: rounds === 1 ? 'ronda' : 'rondas', note: 'A sequência tinha ' + seq.length + ' passos.' }), 450);
        return;
      }
      pos++;
      if (pos === seq.length) { accepting = false; status.textContent = 'Certo'; later(() => { if (alive('simon')) next(); }, 700); }
    }
    board.addEventListener('click', (e) => { const b = e.target.closest('[data-simon]'); if (b) press(+b.dataset.simon); });
    const onKey = (e) => { if (alive('simon') && /^[1-4]$/.test(e.key)) press(+e.key - 1); };
    document.addEventListener('keydown', onKey);
    registerGameCleanup(() => { clearAll(); document.removeEventListener('keydown', onKey); try { ac && ac.close(); } catch (e) { } });
    setGameScore(0);
    renderGameLeaderboard('simon');
    later(next, 400);
  }

  /* ---------- Toupeiras ---------- */
  function startWhack() {
    const { board, footer } = gameBoard('whack', '🔨 Toupeiras');
    footer.textContent = 'Acerta nas toupeiras antes de desaparecerem. Tens 30 segundos. As bombas tiram pontos.';
    board.innerHTML = `<div class="whack-bar"><span>Tempo: <b id="whack-time">30</b> s</span><button class="btn small" id="whack-start">Começar</button></div>
      <div class="whack-grid">${Array.from({ length: 9 }, (_, i) => `<button class="whack-hole" data-hole="${i}" aria-label="Buraco ${i + 1}"><span class="whack-mole"></span></button>`).join('')}</div>`;
    const holes = [...board.querySelectorAll('.whack-hole')];
    let score = 0, left = 30, running = false, active = new Map(), tick = null, spawn = null, hits = 0, miss = 0;
    const timeEl = $('#whack-time');
    function show() {
      if (!running) return;
      const free = holes.map((_, i) => i).filter((i) => !active.has(i));
      if (free.length) {
        const i = free[Math.floor(Math.random() * free.length)];
        const bomb = Math.random() < 0.14;
        holes[i].classList.add('up'); holes[i].classList.toggle('bomb', bomb);
        const t = later(() => { holes[i].classList.remove('up', 'bomb'); active.delete(i); }, 650 + Math.random() * 500);
        active.set(i, { bomb, t });
      }
      spawn = later(show, Math.max(330, 700 - (30 - left) * 12));
    }
    function end() {
      running = false; clearAll(); clearInterval(tick);
      holes.forEach((h) => h.classList.remove('up', 'bomb'));
      submitGameScore('whack', Math.max(0, score), { title: 'Tempo esgotado', note: hits + ' acertos, ' + miss + ' falhas' });
    }
    function start() {
      if (running) return;
      running = true; score = 0; left = 30; hits = 0; miss = 0; setGameScore(0);
      $('#whack-start').disabled = true; timeEl.textContent = left;
      tick = setInterval(() => { left--; timeEl.textContent = Math.max(0, left); if (left <= 0) end(); }, 1000);
      show();
    }
    board.addEventListener('click', (e) => {
      if (e.target.closest('#whack-start')) { start(); return; }
      const h = e.target.closest('[data-hole]');
      if (!h || !running) return;
      const i = +h.dataset.hole, m = active.get(i);
      if (!m) { miss++; return; }
      clearTimeout(m.t); active.delete(i);
      h.classList.remove('up', 'bomb');
      h.classList.add('hit'); later(() => h.classList.remove('hit'), 220);
      if (m.bomb) score -= 5; else { score += 1; hits++; }
      setGameScore(Math.max(0, score));
    });
    registerGameCleanup(() => { running = false; clearAll(); clearInterval(tick); });
    setGameScore(0);
    renderGameLeaderboard('whack');
  }

  /* ---------- Reflexos ---------- */
  function startReaction() {
    const { board, footer } = gameBoard('reaction', '⚡ Reflexos');
    footer.textContent = 'Clica (ou prime Espaço) assim que o ecrã ficar verde. Cinco rondas. A pontuação é 1000 menos o tempo médio em milissegundos.';
    board.innerHTML = `<button class="reaction-pad wait" id="reaction-pad" type="button"><b id="reaction-title">Clica para começar</b><span id="reaction-sub">Ronda 1 de 5</span></button><div class="reaction-times" id="reaction-times"></div>`;
    const pad = $('#reaction-pad'), title = $('#reaction-title'), sub = $('#reaction-sub'), list = $('#reaction-times');
    const ROUNDS = 5;
    let phase = 'idle', t0 = 0, times = [], timer = null;
    const paint = (cls, t, s) => { pad.className = 'reaction-pad ' + cls; title.textContent = t; sub.textContent = s; };
    function arm() {
      phase = 'armed'; paint('armed', 'Espera pelo verde…', 'Ronda ' + (times.length + 1) + ' de ' + ROUNDS);
      timer = later(() => { phase = 'go'; t0 = performance.now(); paint('go', 'Agora', 'Clica já'); }, 1400 + Math.random() * 2800);
    }
    function hit() {
      if (phase === 'idle') { arm(); return; }
      if (phase === 'armed') { clearTimeout(timer); phase = 'idle'; paint('early', 'Cedo demais', 'Clica para repetir esta ronda'); return; }
      if (phase === 'go') {
        const ms = Math.round(performance.now() - t0);
        times.push(ms);
        list.innerHTML = times.map((t, i) => `<span>${i + 1}. <b>${t} ms</b></span>`).join('');
        if (times.length >= ROUNDS) {
          phase = 'done';
          const avg = Math.round(times.reduce((a, b) => a + b, 0) / ROUNDS);
          const score = Math.max(0, 1000 - avg);
          setGameScore(score);
          paint('done', avg + ' ms de média', 'Melhor ronda: ' + Math.min(...times) + ' ms');
          submitGameScore('reaction', score, { title: 'Média de ' + avg + ' ms', note: 'Melhor ronda: ' + Math.min(...times) + ' ms' });
        } else { phase = 'idle'; paint('wait', ms + ' ms', 'Clica para a ronda ' + (times.length + 1) + ' de ' + ROUNDS); }
      }
    }
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); });
    pad.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); hit(); } });
    const onKey = (e) => { if (alive('reaction') && e.key === ' ' && document.activeElement !== pad) { e.preventDefault(); hit(); } };
    document.addEventListener('keydown', onKey);
    registerGameCleanup(() => { clearAll(); document.removeEventListener('keydown', onKey); });
    setGameScore(0);
    renderGameLeaderboard('reaction');
  }

  /* ---------- Puzzle 15 ---------- */
  function startSliding() {
    const { board, footer } = gameBoard('sliding', '🧮 Puzzle 15');
    footer.textContent = 'Desliza as peças para as pôr por ordem, de 1 a 15. Clica numa peça ao lado do espaço vazio ou usa as setas.';
    const N = 4;
    let tiles = [...Array(N * N).keys()].map((i) => i + 1); tiles[N * N - 1] = 0;
    let moves = 0, startedAt = 0, done = false;
    function neighbors(i) { const r = Math.floor(i / N), c = i % N, out = []; if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1); return out; }
    let empty = N * N - 1, prev = -1;
    for (let k = 0; k < 220; k++) {
      const opts = neighbors(empty).filter((x) => x !== prev);
      const t = opts[Math.floor(Math.random() * opts.length)];
      tiles[empty] = tiles[t]; tiles[t] = 0; prev = empty; empty = t;
    }
    if (tiles.every((v, i) => v === (i + 1) % (N * N))) { tiles[0] = tiles[1]; tiles[1] = 1; }
    const solved = () => tiles.every((v, i) => v === (i + 1) % (N * N));
    function render() {
      board.innerHTML = `<div class="slide-bar"><span>Jogadas: <b>${moves}</b></span></div>
        <div class="slide-grid">${tiles.map((v, i) => v ? `<button class="slide-tile ${v === i + 1 ? 'ok' : ''}" data-i="${i}" aria-label="Peça ${v}">${v}</button>` : '<span class="slide-tile empty"></span>').join('')}</div>`;
    }
    function move(i) {
      if (done) return;
      const e = tiles.indexOf(0);
      if (!neighbors(e).includes(i)) return;
      if (!startedAt) startedAt = Date.now();
      tiles[e] = tiles[i]; tiles[i] = 0; moves++;
      render();
      if (solved()) {
        done = true;
        const secs = Math.round((Date.now() - startedAt) / 1000);
        const score = Math.max(10, 1500 - moves * 8 - secs * 2);
        setGameScore(score);
        submitGameScore('sliding', score, { title: 'Puzzle resolvido', note: moves + ' jogadas em ' + secs + ' s' });
      }
    }
    board.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) move(+b.dataset.i); });
    const onKey = (e) => {
      if (!alive('sliding')) return;
      const d = { ArrowUp: N, ArrowDown: -N, ArrowLeft: 1, ArrowRight: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const em = tiles.indexOf(0), t = em + d;
      if (t >= 0 && t < N * N && neighbors(em).includes(t)) move(t);
    };
    document.addEventListener('keydown', onKey);
    registerGameCleanup(() => document.removeEventListener('keydown', onKey));
    setGameScore(0);
    render();
    renderGameLeaderboard('sliding');
  }

  /* ---------- Palavra do Dia (Wordle em português) ---------- */
  const WORDS = ('AMIGO PRAIA FESTA LIVRO MUNDO CASAS TEMPO VERDE NOITE FELIZ SONHO PORTA PRATO LUGAR FORCA GENTE CORPO PAPEL RADIO TERRA VINHO BRISA CHAVE DANCA FILME GRUPO JOGOS LINHA MUSICA'.replace('MUSICA', 'MOEDA') +
    ' NUVEM OLHAR PEIXE PONTE QUEDA RISCO SABOR TARDE UNIDO VALOR VENTO ZEBRA ACASO AREIA BANCO BEIJO BOLOS CAMPO CARRO CERTO CINCO CLARO COISA CORAL CORES CURVA DEDOS DENTE DOCES ERROS ESTAR FAROL FERRO FLORA FOGOS FRUTA GANHO GELOS GOSTO GRAUS HOTEL IDEIA JOVEM LARGO LEITE LIMAO MANHA MESAS METRO MOLHO MORAR NAVIO NINHO NORTE OBRAS OUTRO PASSO PEDRA PIZZA PLANO POETA PRAZO QUASE RISOS ROSAS SALTO SENHA SINAL SORTE TEXTO TIGRE TINTA TORRE TROCA URSOS VAPOR VELAS VIDAS VISTA VOZES').split(/\s+/).filter((w) => /^[A-Z]{5}$/.test(w));
  function startWordle() {
    const { board, footer } = gameBoard('wordle', '🔤 Palavra do Dia');
    footer.textContent = 'Descobre a palavra de cinco letras em seis tentativas. Verde: letra certa no sítio certo. Dourado: letra certa no sítio errado. Cinzento: não existe. Sem acentos.';
    const answer = WORDS[Math.floor(Math.random() * WORDS.length)];
    const ROWS = 6;
    let guesses = [], cur = '', done = false;
    const rowsEl = document.createElement('div'); rowsEl.className = 'wd-grid'; rowsEl.setAttribute('aria-label', 'Tentativas');
    const kb = document.createElement('div'); kb.className = 'wd-kb';
    const msg = document.createElement('div'); msg.className = 'wd-msg'; msg.setAttribute('aria-live', 'polite');
    board.append(msg, rowsEl, kb);
    const layout = ['QWERTYUIOP', 'ASDFGHJKL', '*ZXCVBNM<'];
    kb.innerHTML = layout.map((r) => `<div>${[...r].map((k) => k === '*' ? '<button data-k="Enter" class="wide">Enter</button>' : k === '<' ? '<button data-k="Backspace" class="wide" aria-label="Apagar">⌫</button>' : `<button data-k="${k}">${k}</button>`).join('')}</div>`).join('');
    function score(g) {
      const res = Array(5).fill('absent'), rest = {};
      for (let i = 0; i < 5; i++) { if (g[i] === answer[i]) res[i] = 'correct'; else rest[answer[i]] = (rest[answer[i]] || 0) + 1; }
      for (let i = 0; i < 5; i++) if (res[i] !== 'correct' && rest[g[i]]) { res[i] = 'present'; rest[g[i]]--; }
      return res;
    }
    const keyState = {};
    function render() {
      rowsEl.innerHTML = Array.from({ length: ROWS }, (_, r) => {
        const g = guesses[r], res = g ? score(g) : null;
        return `<div class="wd-row">${Array.from({ length: 5 }, (_, c) => {
          const ch = g ? g[c] : (r === guesses.length ? cur[c] || '' : '');
          return `<span class="wd-tile ${res ? res[c] : ch ? 'filled' : ''}">${ch}</span>`;
        }).join('')}</div>`;
      }).join('');
      kb.querySelectorAll('[data-k]').forEach((b) => { b.className = (b.className.match(/wide/) ? 'wide ' : '') + (keyState[b.dataset.k] || ''); });
    }
    function toast2(t) { msg.textContent = t; later(() => { if (msg.textContent === t) msg.textContent = ''; }, 1800); }
    function submit() {
      if (cur.length < 5) { toast2('Faltam letras'); return; }
      const g = cur; guesses.push(g); cur = '';
      const res = score(g);
      const rank = { absent: 1, present: 2, correct: 3 };
      [...g].forEach((ch, i) => { if (!keyState[ch] || rank[res[i]] > rank[keyState[ch]]) keyState[ch] = res[i]; });
      render();
      if (g === answer) {
        done = true; const pts = (ROWS + 1 - guesses.length) * 100; setGameScore(pts);
        submitGameScore('wordle', pts, { title: 'Acertaste', note: 'Em ' + guesses.length + (guesses.length === 1 ? ' tentativa' : ' tentativas') });
      } else if (guesses.length >= ROWS) {
        done = true;
        submitGameScore('wordle', 0, { title: 'A palavra era ' + answer, note: 'Não foi desta.' });
      }
    }
    function key(k) {
      if (done) return;
      if (k === 'Enter') submit();
      else if (k === 'Backspace') { cur = cur.slice(0, -1); render(); }
      else if (/^[A-Za-z]$/.test(k) && cur.length < 5) { cur += k.toUpperCase(); render(); }
    }
    kb.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
    const onKey = (e) => {
      if (!alive('wordle') || e.ctrlKey || e.metaKey || e.altKey || done) return;
      if (document.querySelector('#game-area .game-over')) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[A-Za-z]$/.test(e.key)) { e.preventDefault(); key(e.key); }
    };
    document.addEventListener('keydown', onKey);
    registerGameCleanup(() => { clearAll(); document.removeEventListener('keydown', onKey); });
    setGameScore(0);
    render();
    renderGameLeaderboard('wordle');
  }

  window.PICALTA_EXTRA_GAMES = { simon: startSimon, whack: startWhack, reaction: startReaction, sliding: startSliding, wordle: startWordle };
})();
