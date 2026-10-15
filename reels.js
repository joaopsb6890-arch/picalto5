/* Picalta — Reels: vídeos curtos verticais.
   Os reels são publicações normais (coleção posts) com type:'reel', videoUrl e imageUrl (capa).
   Assim reutilizam gostos, comentários, coleções, denúncias, regras e apagar já existentes. */
'use strict';
(function () {
  const S = window.PICALTA_STATE;
  const Q = (s, r) => (r || document).querySelector(s);
  const QA = (s, r) => [...(r || document).querySelectorAll(s)];
  const MAX_SECONDS = 90;
  let tab = 'all', muted = true, activeId = null, userPaused = false, observer = null;
  let signature = '', commentUnsub = null, commentFor = null, wasOverlay = false;
  const counts = {}, expanded = new Set();
  let tapTimer = null;

  const H = () => window.PICALTA_V5 && window.PICALTA_V5.h;
  const E = (v) => (H() ? H().E(v) : String(v == null ? '' : v));
  const I = (n, s) => window.icon(n, s);
  const fmt = (n) => new Intl.NumberFormat('pt-PT', { notation: n > 9999 ? 'compact' : 'standard' }).format(n || 0);
  const isReel = (p) => p && p.type === 'reel' && p.videoUrl;
  const uid = () => S.me && S.me.uid;

  function playableUrl(url) {
    // Ficheiros que os browsers nem sempre reproduzem (MOV, HEVC) são entregues em MP4/H.264 pelo Cloudinary.
    if (/res\.cloudinary\.com\/.+\/video\/upload\//.test(url) && /\.(mov|m4v|3gp|avi|mkv)(\?|$)/i.test(url)) {
      return url.replace('/video/upload/', '/video/upload/f_mp4,vc_h264,q_auto/').replace(/\.[a-z0-9]+(\?|$)/i, '.mp4$1');
    }
    return url;
  }
  function visibleReels() {
    const h = H();
    const prefs = h ? h.prefs() : { blocked: [], muted: [], hiddenPosts: [] };
    let list = (S.posts || []).filter((p) => isReel(p) && !prefs.blocked.includes(p.uid) && !prefs.muted.includes(p.uid) && !prefs.hiddenPosts.includes(p.id));
    if (tab === 'following') list = list.filter((p) => S.myFollowing.includes(p.uid) || p.uid === uid());
    return list;
  }

  function reelHtml(p, i) {
    const h = H(), u = h.user(p.uid), liked = (p.likes || []).includes(uid()), fav = S.myFavorites.includes(p.id);
    const following = S.myFollowing.includes(p.uid), mine = p.uid === uid();
    const fit = p.aspect && p.aspect > 0.8 ? 'contain' : 'cover';
    const caption = (p.caption || '').trim(), long = caption.length > 90;
    const comments = counts[p.id] != null ? counts[p.id] : (S.commentsCache[p.id] ? S.commentsCache[p.id].length : null);
    return `<article class="reel" data-reel="${E(p.id)}" data-post-id="${E(p.id)}" data-index="${i}" data-fit="${fit}" aria-label="Reel de ${E(u.name)}">
      <video class="reel-video" playsinline loop ${muted ? 'muted' : ''} preload="none" poster="${h.safeUrl(p.posterUrl || p.imageUrl)}" data-src="${h.safeUrl(playableUrl(p.videoUrl))}" aria-label="${E(caption || 'Vídeo de ' + u.name)}"></video>
      <div class="reel-shade" aria-hidden="true"></div>
      <button class="reel-tap" data-reel-tap aria-label="Pausar ou reproduzir"></button>
      <div class="reel-heart" aria-hidden="true">${I('heart', 96)}</div>
      <div class="reel-flash" aria-hidden="true"></div>
      <div class="reel-loading" aria-hidden="true"><span></span></div>
      <button class="reel-sound" data-reel-sound aria-label="${muted ? 'Ligar o som' : 'Desligar o som'}" aria-pressed="${!muted}">${I(muted ? 'volume-x' : 'volume-2', 20)}</button>
      <div class="reel-info">
        <div class="reel-author">
          <button class="reel-author-link" data-goto-profile="${E(p.uid)}">${h.avatar(u)}<b>${E(u.name)}</b></button>
          ${mine ? '' : `<button class="reel-follow ${following ? 'is-following' : ''}" data-reel-follow="${E(p.uid)}">${following ? 'A seguir' : 'Seguir'}</button>`}
        </div>
        ${caption ? `<p class="reel-caption ${expanded.has(p.id) ? 'open' : ''}" ${long ? 'data-reel-more role="button" tabindex="0" aria-expanded="' + expanded.has(p.id) + '"' : ''}>${E(caption)}</p>` : ''}
        <div class="reel-music">${I('music-2', 14)}<span>Som original · ${E(u.name)}</span></div>
      </div>
      <div class="reel-actions">
        <button class="reel-act like-btn ${liked ? 'liked' : ''}" data-like="${E(p.id)}" aria-pressed="${liked}" aria-label="${liked ? 'Retirar gosto' : 'Gostar'}">${I('heart', 28)}<span class="reel-like-count">${fmt((p.likes || []).length)}</span></button>
        <button class="reel-act" data-comments-open="${E(p.id)}" aria-label="Abrir comentários">${I('message-circle', 28)}<span class="reel-comment-count">${comments == null ? '' : fmt(comments)}</span></button>
        <button class="reel-act ${fav ? 'saved' : ''}" data-reel-save="${E(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remover dos favoritos' : 'Guardar nos favoritos'}">${I('bookmark', 28)}<span>Guardar</span></button>
        <button class="reel-act" data-v5-share="${E(p.id)}" aria-label="Partilhar reel">${I('share-2', 26)}<span>Partilhar</span></button>
        <button class="reel-act" data-post-menu="${E(p.id)}" aria-label="Mais opções">${I('ellipsis', 26)}</button>
      </div>
      <div class="reel-progress" data-reel-seek role="slider" aria-label="Posição do vídeo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    </article>`;
  }

  function render() {
    const view = Q('#view-reels');
    if (!view || !uid() || !H()) return;
    const list = visibleReels();
    signature = list.map((p) => p.id).join('|') + '|' + tab;
    const h = H();
    teardownObserver();
    view.innerHTML = `<div class="reels-shell">
      <div class="reels-head"><div><span class="eyebrow">VÍDEOS CURTOS</span><h1>Reels<span>.</span></h1><p>Pequenos momentos em movimento.</p></div><button class="btn" data-reel-create>${I('plus', 18)}Criar reel</button></div>
      <div class="reels-stage">
        <div class="reels-tabs" role="tablist" aria-label="Origem dos reels"><button role="tab" aria-selected="${tab === 'all'}" class="${tab === 'all' ? 'active' : ''}" data-reel-tab="all">Para ti</button><button role="tab" aria-selected="${tab === 'following'}" class="${tab === 'following' ? 'active' : ''}" data-reel-tab="following">A seguir</button></div>
        <button class="reels-create-mobile" data-reel-create aria-label="Criar reel">${I('plus', 22)}</button>
        ${list.length ? `<div class="reels-scroll" id="reels-scroll" tabindex="0" aria-label="Lista de reels. Usa as setas para cima e para baixo.">${list.map(reelHtml).join('')}</div>
        <div class="reels-nav"><button data-reel-step="-1" aria-label="Reel anterior">${I('chevron-up', 22)}</button><button data-reel-step="1" aria-label="Reel seguinte">${I('chevron-down', 22)}</button></div>` :
        `<div class="reels-empty">${h.empty(tab === 'following' ? 'Ainda não há reels de quem segues' : 'O primeiro reel pode ser o teu', tab === 'following' ? 'Quando as pessoas que segues partilharem vídeos, aparecem aqui.' : 'Partilha um vídeo vertical de até 90 segundos.', h.btn(I('plus', 18) + 'Criar reel', 'data-reel-create', 'btn'), 'clapperboard')}</div>`}
      </div></div>`;
    if (list.length) setupObserver();
  }

  function setupObserver() {
    const root = Q('#reels-scroll');
    if (!root) return;
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting && en.intersectionRatio >= 0.6) activate(en.target.dataset.reel);
    }, { root, threshold: [0.6] });
    QA('.reel', root).forEach((el) => {
      observer.observe(el);
      const v = Q('video', el);
      v.addEventListener('timeupdate', () => progress(el, v));
      v.addEventListener('waiting', () => el.classList.add('is-loading'));
      v.addEventListener('playing', () => { el.classList.remove('is-loading'); el.classList.add('has-played'); });
      v.addEventListener('canplay', () => el.classList.remove('is-loading'));
      v.addEventListener('error', () => { el.classList.remove('is-loading'); el.classList.add('has-error'); });
    });
    const target = activeId && QA('.reel', root).find((el) => el.dataset.reel === activeId);
    if (target) { root.scrollTop = target.offsetTop; activate(activeId, true); }
    else { const first = Q('.reel', root); if (first) activate(first.dataset.reel, true); }
  }
  function teardownObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    QA('#reels-scroll video').forEach(release);
    if (commentUnsub) { try { commentUnsub(); } catch (e) {} commentUnsub = null; commentFor = null; }
  }
  function release(v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
  function progress(el, v) {
    if (!v.duration) return;
    const pct = Math.min(100, (v.currentTime / v.duration) * 100);
    const bar = Q('.reel-progress i', el);
    if (bar) bar.style.width = pct + '%';
    const slider = Q('.reel-progress', el);
    if (slider) slider.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  function load(el) {
    const v = Q('video', el);
    if (v && !v.getAttribute('src') && v.dataset.src) { el.classList.add('is-loading'); v.src = v.dataset.src; v.preload = 'auto'; }
  }
  function activate(id, force) {
    if (!force && id === activeId) return;
    const els = QA('#reels-scroll .reel');
    const idx = els.findIndex((el) => el.dataset.reel === id);
    if (idx < 0) return;
    const prev = activeId && els.find((el) => el.dataset.reel === activeId);
    if (prev && activeId !== id) { const pv = Q('video', prev); pv.pause(); }
    activeId = id;
    userPaused = false;
    els.forEach((el, i) => {
      el.classList.toggle('is-active', i === idx);
      if (Math.abs(i - idx) <= 1) load(el);
      else if (Math.abs(i - idx) > 2) { const v = Q('video', el); if (v.getAttribute('src')) { release(v); el.classList.remove('has-played'); } }
    });
    const cur = els[idx], v = Q('video', cur);
    cur.classList.remove('is-paused');
    if (id !== (prev && prev.dataset.reel)) { try { v.currentTime = 0; } catch (e) {} }
    play(v, cur);
    watchComments(id);
    const tp = (S.posts || []).find((p) => p.id === id);
    if (tp && !tp._seen) { tp._seen = true; }
  }
  function play(v, el) {
    if (S.view !== 'reels' || document.hidden || H().overlay) return;
    v.muted = muted;
    const pr = v.play();
    if (pr && pr.catch) pr.catch(() => {
      // Autoplay com som pode ser bloqueado: tenta em silêncio.
      if (!v.muted) { muted = true; applySound(); v.muted = true; v.play().catch(() => el.classList.add('is-paused')); }
      else el.classList.add('is-paused');
    });
  }
  function watchComments(id) {
    if (commentFor === id) return;
    if (commentUnsub) { try { commentUnsub(); } catch (e) {} commentUnsub = null; }
    commentFor = id;
    try {
      commentUnsub = dbWatchComments(id, (snap) => {
        counts[id] = snap.docs ? snap.docs.length : snap.size;
        const el = Q(`.reel[data-reel="${CSS.escape(id)}"] .reel-comment-count`);
        if (el) el.textContent = fmt(counts[id]);
      });
    } catch (e) { /* sem contador, o resto funciona */ }
  }
  function applySound() {
    QA('#reels-scroll video').forEach((v) => { v.muted = muted; });
    QA('.reel-sound').forEach((b) => { b.innerHTML = I(muted ? 'volume-x' : 'volume-2', 20); b.setAttribute('aria-pressed', String(!muted)); b.setAttribute('aria-label', muted ? 'Ligar o som' : 'Desligar o som'); });
  }
  function toggleSound() {
    muted = !muted; applySound();
    const el = activeEl();
    if (el) { const v = Q('video', el); v.muted = muted; if (!muted && v.paused && !userPaused) v.play().catch(() => {}); flash(el, muted ? 'volume-x' : 'volume-2'); }
  }
  function activeEl() { return activeId ? Q(`.reel[data-reel="${CSS.escape(activeId)}"]`) : null; }
  function flash(el, icon) {
    const f = Q('.reel-flash', el);
    if (!f) return;
    f.innerHTML = I(icon, 40);
    f.classList.remove('play'); void f.offsetWidth; f.classList.add('play');
  }
  function togglePlay() {
    const el = activeEl();
    if (!el) return;
    const v = Q('video', el);
    if (v.paused) { userPaused = false; el.classList.remove('is-paused'); v.play().catch(() => {}); flash(el, 'play'); }
    else { userPaused = true; v.pause(); el.classList.add('is-paused'); flash(el, 'pause'); }
  }
  function step(delta) {
    const els = QA('#reels-scroll .reel');
    const idx = els.findIndex((el) => el.dataset.reel === activeId);
    const next = els[Math.max(0, Math.min(els.length - 1, idx + delta))];
    if (next) next.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'start' });
  }
  function openReel(id) {
    if (!visibleReels().some((p) => p.id === id)) { tab = 'all'; }
    activeId = id;
    render();
  }
  function like(el) {
    const id = el.dataset.reel, p = (S.posts || []).find((x) => x.id === id);
    if (!p) return;
    const heart = Q('.reel-heart', el);
    heart.classList.remove('play'); void heart.offsetWidth; heart.classList.add('play');
    if (!(p.likes || []).includes(uid())) H().like(id);
  }
  async function toggleSave(id, btn) {
    try {
      const cur = S.myFavorites.includes(id);
      const now = await dbToggleFavorite(uid(), id, cur);
      const i = S.myFavorites.indexOf(id);
      if (now && i < 0) S.myFavorites.push(id);
      if (!now && i >= 0) S.myFavorites.splice(i, 1);
      btn.classList.toggle('saved', now);
      btn.setAttribute('aria-pressed', String(now));
      btn.setAttribute('aria-label', now ? 'Remover dos favoritos' : 'Guardar nos favoritos');
      toast(now ? 'Reel guardado nos favoritos.' : 'Removido dos favoritos.');
    } catch (e) { toast('Não foi possível guardar.'); }
  }
  async function follow(target, btn) {
    try {
      const cur = S.myFollowing.includes(target);
      const now = await dbToggleFollow(target, uid(), cur);
      if (now && !cur) { S.myFollowing.push(target); if (typeof xpOnFollow === 'function') xpOnFollow(); }
      if (!now) S.myFollowing = S.myFollowing.filter((x) => x !== target);
      QA(`[data-reel-follow="${CSS.escape(target)}"]`).forEach((b) => { b.classList.toggle('is-following', now); b.textContent = now ? 'A seguir' : 'Seguir'; });
      toast(now ? 'A seguir.' : 'Deixaste de seguir.');
    } catch (e) { toast('Não foi possível concluir.'); }
  }

  /* ---------- criar reel ---------- */
  function videoMeta(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
      const done = (fn) => (arg) => { fn(arg); };
      v.onloadedmetadata = done(() => {
        const info = { url, duration: v.duration, width: v.videoWidth, height: v.videoHeight };
        if (!isFinite(v.duration) || !v.videoWidth) { URL.revokeObjectURL(url); reject(new Error('Este vídeo não pôde ser lido. Experimenta MP4 (H.264) ou WebM.')); return; }
        resolve(info);
      });
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Este formato de vídeo não é suportado pelo navegador. Usa MP4 (H.264) ou WebM.')); };
    });
  }
  function posterFrom(url, at) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      const fail = () => resolve(null);
      v.onerror = fail;
      v.onloadeddata = () => { try { v.currentTime = at; } catch (e) { fail(); } };
      v.onseeked = () => {
        try {
          const ratio = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * ratio); c.height = Math.round(v.videoHeight * ratio);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.78));
        } catch (e) { fail(); }
      };
      setTimeout(fail, 6000);
    });
  }
  function createReel() {
    const h = H();
    const needsCdn = !window.PICALTA_DEMO && !cloudinaryConfigured();
    h.modal('reelcreate', 'O teu próximo reel', `<div class="reel-create">
      <div class="reel-create-preview" id="reel-create-preview"><div class="reel-create-empty">${I('clapperboard', 40)}<span>O teu vídeo aparece aqui</span></div></div>
      <div class="reel-create-fields">
        <label class="p-upload" for="reel-file">${I('image-plus', 30)}<b>Escolher vídeo</b><span>MP4, WebM ou MOV · até ${MAX_SECONDS} segundos · até 80 MB</span></label>
        <input type="file" id="reel-file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden>
        <p class="info-line" id="reel-file-info" hidden></p>
        <label class="field"><span>Uma legenda para o reel</span><textarea id="reel-caption" rows="4" maxlength="300" placeholder="Conta o contexto. Usa #hashtags para seres descoberto."></textarea><span class="field-counter" id="reel-caption-count">0 / 300</span></label>
        <div class="reel-progress-upload" id="reel-upload" hidden><div><i></i></div><span>A enviar…</span></div>
        ${needsCdn ? `<div class="inline-alert">${I('circle-alert')}<span>O envio de vídeos precisa do Cloudinary. Preenche as variáveis CLOUDINARY_* no .env e volta a gerar a configuração.</span></div>` : ''}
        <p class="info-line">${I('clock', 17)}Vídeos na vertical (9:16) ficam melhor. Outros formatos aparecem com margens.</p>
      </div></div>
      <div class="dialog-actions">${h.btn('Cancelar', 'data-close-overlay')}${h.btn(I('send', 17) + 'Partilhar reel', 'id="reel-publish" disabled', 'btn')}</div>`, { wide: true, kicker: 'VÍDEOS CURTOS' });
    const state = { file: null, meta: null, poster: null };
    const info = Q('#reel-file-info');
    Q('#reel-caption').oninput = (e) => { Q('#reel-caption-count').textContent = e.target.value.length + ' / 300'; };
    Q('#reel-file').onchange = (e) => h.run(null, async () => {
      const f = e.target.files[0];
      if (!f) return;
      if (!/^video\//.test(f.type)) throw new Error('Escolhe um ficheiro de vídeo.');
      if (f.size > 80 * 1024 * 1024) throw new Error('O vídeo pode ter até 80 MB.');
      const meta = await videoMeta(f);
      if (meta.duration > MAX_SECONDS + 0.5) { URL.revokeObjectURL(meta.url); throw new Error('O vídeo tem ' + Math.round(meta.duration) + ' segundos. O máximo são ' + MAX_SECONDS + '.'); }
      if (state.meta) URL.revokeObjectURL(state.meta.url);
      state.file = f; state.meta = meta;
      state.poster = await posterFrom(meta.url, Math.min(0.6, meta.duration / 2));
      const prev = Q('#reel-create-preview');
      if (prev) { prev.innerHTML = `<video src="${meta.url}" controls muted loop playsinline poster="${state.poster || ''}"></video>`; prev.classList.toggle('landscape', meta.width / meta.height > 0.8); }
      info.hidden = false;
      info.innerHTML = `${I('check', 17)}${E(f.name)} · ${Math.round(meta.duration)} s · ${meta.width}×${meta.height} · ${(f.size / 1048576).toFixed(1)} MB`;
      Q('#reel-publish').disabled = needsCdn;
    });
    Q('#reel-publish').onclick = (e) => h.run(e.currentTarget, async () => {
      if (!state.file) throw new Error('Escolhe um vídeo.');
      const caption = Q('#reel-caption').value.trim();
      const bar = Q('#reel-upload');
      bar.hidden = false;
      const setPct = (p) => { Q('i', bar).style.width = Math.round(p * 100) + '%'; Q('span', bar).textContent = p >= 1 ? 'A concluir…' : 'A enviar… ' + Math.round(p * 100) + '%'; };
      let videoUrl, poster, duration = state.meta.duration;
      if (window.PICALTA_DEMO) {
        videoUrl = state.meta.url; poster = state.poster || 'demo/reel1.jpg';
        for (let i = 1; i <= 5; i++) { setPct(i / 5); await new Promise((r) => setTimeout(r, 120)); }
      } else {
        const up = await cdnUploadVideo(state.file, 'picalta/reels', setPct);
        videoUrl = up.url; duration = up.duration || duration;
        poster = up.url.replace('/video/upload/', '/video/upload/so_0,w_720,c_limit/').replace(/\.[a-z0-9]+(\?|$)/i, '.jpg$1');
      }
      const post = { type: 'reel', videoUrl, imageUrl: poster, posterUrl: poster, images: [], caption, text: '', location: '', hashtags: [...new Set(caption.match(/#[\p{L}\p{N}_]+/gu) || [])], duration: Math.round(duration * 10) / 10, aspect: Math.round((state.meta.width / state.meta.height) * 1000) / 1000 };
      const ref = await V5DATA.createPost(post);
      h.closeOverlay(true);
      tab = 'all'; activeId = ref && ref.id ? ref.id : null;
      if (typeof xpOnPost === 'function') xpOnPost();
      h.tick('photo');
      if (typeof unlockAchievement === 'function') unlockAchievement('first_post');
      render();
      toast('O teu reel já está no ar.');
    });
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (e) => {
    if (!uid()) return;
    const c = (s) => e.target.closest(s);
    let el;
    if ((el = c('[data-reel-create]'))) { createReel(); return; }
    if ((el = c('[data-reel-tab]'))) { tab = el.dataset.reelTab; activeId = null; render(); return; }
    if ((el = c('[data-reel-step]'))) { step(Number(el.dataset.reelStep)); return; }
    if ((el = c('[data-reel-sound]'))) { toggleSound(); return; }
    if ((el = c('[data-reel-save]'))) { toggleSave(el.dataset.reelSave, el); return; }
    if ((el = c('[data-reel-follow]'))) { follow(el.dataset.reelFollow, el); return; }
    if ((el = c('[data-reel-more]'))) { const id = el.closest('.reel').dataset.reel; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); el.classList.toggle('open'); el.setAttribute('aria-expanded', String(expanded.has(id))); return; }
    if ((el = c('[data-reel-seek]'))) {
      const reel = el.closest('.reel'), v = Q('video', reel), r = el.getBoundingClientRect();
      if (v && v.duration) v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration;
      return;
    }
    if ((el = c('[data-reel-tap]'))) {
      const reel = el.closest('.reel');
      clearTimeout(tapTimer);
      if (reel.dataset.reel !== activeId) return;
      tapTimer = setTimeout(togglePlay, 230);
    }
  });
  document.addEventListener('dblclick', (e) => {
    const t = e.target.closest('[data-reel-tap]');
    if (!t || !uid()) return;
    clearTimeout(tapTimer);
    like(t.closest('.reel'));
  });
  document.addEventListener('keydown', (e) => {
    if (!uid() || S.view !== 'reels' || H().overlay) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 'j') { e.preventDefault(); step(1); }
    else if (k === 'arrowup' || k === 'k') { e.preventDefault(); step(-1); }
    else if (k === 'm') { e.preventDefault(); toggleSound(); }
    else if (k === ' ') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); togglePlay(); }
    else if (k === 'l') { const el = activeEl(); if (el) like(el); }
  });
  document.addEventListener('visibilitychange', () => {
    if (S.view !== 'reels') return;
    const el = activeEl();
    if (!el) return;
    const v = Q('video', el);
    if (document.hidden) v.pause(); else if (!userPaused) play(v, el);
  });
  new MutationObserver(() => {
    if (S.view !== 'reels') return;
    const open = document.body.classList.contains('overlay-open');
    if (open === wasOverlay) return;
    wasOverlay = open;
    const el = activeEl();
    if (!el) return;
    const v = Q('video', el);
    if (open) v.pause(); else if (!userPaused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function refresh() {
    if (S.view !== 'reels' || !uid() || !H()) return;
    const list = visibleReels();
    const sig = list.map((p) => p.id).join('|') + '|' + tab;
    if (sig !== signature) { render(); return; }
    // Mesmo conjunto de reels: só atualiza gostos e favoritos sem interromper o vídeo.
    list.forEach((p) => {
      const el = Q(`.reel[data-reel="${CSS.escape(p.id)}"]`);
      if (!el) return;
      const liked = (p.likes || []).includes(uid()), b = Q('[data-like]', el);
      if (b) { b.classList.toggle('liked', liked); b.setAttribute('aria-pressed', String(liked)); }
      const lc = Q('.reel-like-count', el);
      if (lc) lc.textContent = fmt((p.likes || []).length);
    });
  }
  function onNavigate(view) {
    if (view === 'reels') {
      if (!uid()) return;
      // Fica visível primeiro; a renderização acontece quando S.view já está atualizado.
      setTimeout(() => { if (S.view === 'reels') { signature = ''; render(); } }, 0);
      return;
    }
    const el = activeEl();
    if (el) Q('video', el).pause();
    teardownObserver();
    signature = '';
  }
  window.PICALTA_REELS = { onNavigate, refresh, open: (id) => { openReel(id); }, render };
})();
