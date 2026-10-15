/* Picalta — Grupos (versão Firebase)
 * Módulo independente: view Grupos com criação, adesão, publicação e membros.
 * Usa a mesma infraestrutura do app.js (state, escapeHtml, toast, avatarOf, etc).
 */
'use strict';

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------- Estado local do módulo ---------- */
  let groupsUnsub = null;
  let currentGroup = null; // { id, ...data }
  let groupMembers = [];
  let groupMembersUnsub = null;
  let groupPostsUnsub = null;

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&#39;');
  }
  function toast_(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast_._t);
    toast_._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function avatar_(user) {
    if (!user) return '<div class="avatar-fallback">?</div>';
    if (user.avatarUrl) return `<img class="avatar" src="${esc(user.avatarUrl)}" alt="" crossorigin="anonymous">`;
    const bg = user.avatarColor || '#672ea4';
    const ini = (user.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return `<div class="avatar-fallback" style="background:${esc(bg)}">${esc(ini)}</div>`;
  }
  function initials_(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  function timeAgo_(ts) {
    if (!ts) return '';
    const ms = typeof ts === 'object' && ts.toMillis ? ts.toMillis() : ts;
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
  }

  /* ---------- Firestore helpers ---------- */
  const FSNS = () => __fsFns;
  async function fsCreateGroup(uid, name, description) {
    const { addDoc, collection, serverTimestamp } = FSNS();
    const ref = await addDoc(collection(db, 'groups'), {
      owner: uid,
      name: (name || '').trim(),
      description: (description || '').trim(),
      coverUrl: null,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
  async function fsJoinGroup(groupId, uid) {
    const { doc, setDoc, serverTimestamp } = FSNS();
    await setDoc(doc(db, 'groups', groupId, 'members', uid), {
      uid, role: 'member', joinedAt: serverTimestamp(),
    }, { merge: true });
  }
  async function fsLeaveGroup(groupId, uid) {
    const { doc, deleteDoc } = FSNS();
    await deleteDoc(doc(db, 'groups', groupId, 'members', uid));
  }
  async function fsAddGroupPost(groupId, uid, text, imageUrl) {
    const { addDoc, collection, serverTimestamp } = FSNS();
    await addDoc(collection(db, 'groups', groupId, 'posts'), {
      uid, text: (text || '').trim(), imageUrl: imageUrl || null,
      createdAt: serverTimestamp(),
    });
  }
  async function fsRemoveGroupPost(groupId, postId, isMine, isOwner) {
    const { doc, deleteDoc } = FSNS();
    await deleteDoc(doc(db, 'groups', groupId, 'posts', postId));
  }
  function fsWatchGroups(callback) {
    const { collection, onSnapshot, orderBy, query, limit } = FSNS();
    const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, callback);
  }
  function fsWatchGroupMembers(groupId, callback) {
    const { collection, onSnapshot } = FSNS();
    return onSnapshot(collection(db, 'groups', groupId, 'members'), callback);
  }
  function fsWatchGroupPosts(groupId, callback) {
    const { collection, onSnapshot, orderBy, query, limit } = FSNS();
    const q = query(collection(db, 'groups', groupId, 'posts'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(q, callback);
  }

  /* ---------- Render ---------- */
  async function renderGroupsList() {
    const state = window.PICALTA_STATE;
    const box = $('#groups-list');
    if (!box) return;
    const groups = state.groups || [];
    if (!groups.length) {
      box.innerHTML = '<div class="empty">Sem grupos ainda. Cria o primeiro!</div>';
      return;
    }
    // carrega contagem de membros para cada grupo (via subcoleção)
    const counts = {};
    for (const g of groups) {
      try {
        const { collection, getDocs } = FSNS();
        const snap = await getDocs(collection(db, 'groups', g.id, 'members'));
        counts[g.id] = snap.size;
      } catch (e) { counts[g.id] = 0; }
    }
    const myUid = state.me.uid;
    box.innerHTML = groups.map((g) => {
      const isOwner = g.owner === myUid;
      const isMember = groupMembers.some((m) => m.uid === myUid && m.groupId === g.id);
      return `
      <div class="group-card">
        <div class="group-head">
          <div class="group-avatar">${esc((g.name || '?')[0] || '?')}</div>
          <div class="group-meta">
            <b>${esc(g.name || '?')}</b>
            <span>${esc((g.description || '').slice(0, 80)) || 'sem descrição'}</span>
            <span class="group-count">${counts[g.id] || 0} membro(s)</span>
          </div>
          <div class="group-actions">
            <button class="btn small" data-open-group="${esc(g.id)}">Abrir</button>
            ${isOwner ? '' : isMember
              ? `<button class="btn small ghost" data-leave-group="${esc(g.id)}">Sair</button>`
              : `<button class="btn small" data-join-group="${esc(g.id)}">Entrar</button>`}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- Modal criar grupo ---------- */
  function openCreateGroupModal() {
    $('#new-group-modal').style.display = 'grid';
  }
  function closeCreateGroupModal() {
    $('#new-group-modal').style.display = 'none';
  }

  /* ---------- Detail view ---------- */
  async function openGroup(groupId) {
    const state = window.PICALTA_STATE;
    const g = (state.groups || []).find((x) => x.id === groupId);
    if (!g) { toast_('Grupo não encontrado'); return; }
    currentGroup = g;
    // listeners
    if (groupMembersUnsub) { try { groupMembersUnsub(); } catch (e) {} }
    if (groupPostsUnsub) { try { groupPostsUnsub(); } catch (e) {} }
    groupMembersUnsub = fsWatchGroupMembers(groupId, (snap) => {
      groupMembers = snap.docs.map((d) => ({ id: d.id, groupId, ...d.data() }));
      renderGroupDetail();
    });
    groupPostsUnsub = fsWatchGroupPosts(groupId, (snap) => {
      state.groupPosts = state.groupPosts || {};
      state.groupPosts[groupId] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderGroupDetail();
    });
    navigate('groups');
    renderGroupDetail();
  }
  function renderGroupDetail() {
    const state = window.PICALTA_STATE;
    if (!currentGroup) return;
    const box = $('#group-detail');
    if (!box) return;
    const myUid = state.me.uid;
    const isMember = groupMembers.some((m) => m.uid === myUid);
    const isOwner = currentGroup.owner === myUid;
    const posts = (state.groupPosts && state.groupPosts[currentGroup.id]) || [];
    box.innerHTML = `
      <div class="group-detail-head">
        <button class="btn ghost small" data-back-to-groups">← Grupos</button>
        <h3>${esc(currentGroup.name || '?')}</h3>
        <p>${esc(currentGroup.description || '')}</p>
        <div class="group-detail-actions">
          ${isOwner ? '<span class="badge">Dono</span>' : ''}
          ${!isOwner ? (isMember
            ? `<button class="btn small ghost" data-leave-group="${esc(currentGroup.id)}">Sair</button>`
            : `<button class="btn small" data-join-group="${esc(currentGroup.id)}">Entrar</button>`) : ''}
        </div>
      </div>
      <div class="group-members-list">
        <h4>Membros</h4>
        ${groupMembers.length ? groupMembers.map((m) => `
          <div class="group-member">
            ${avatar_(m)}
            <span>@${esc(m.username || (m.uid || '').slice(0, 8))}</span>
            <span class="badge">${m.role === 'admin' ? 'Admin' : 'Membro'}</span>
          </div>`).join('') : '<div class="empty">Sem membros ainda.</div>'}
      </div>
      <div class="group-posts">
        <h4>Publicações do grupo</h4>
        ${posts.length ? posts.map((p) => {
          const pu = state.usersCache[p.uid] || { username: '?' };
          return `<div class="group-post">
            <div class="meta">${avatar_(pu)} <b>@${esc(pu.username || '?')}</b> <span style="color:var(--color-text-faint);font-size:var(--text-xs)">${timeAgo_(p.createdAt)}</span></div>
            ${p.imageUrl ? `<img class="post-image" src="${esc(p.imageUrl)}" alt="" loading="lazy" crossorigin="anonymous" />` : ''}
            <p>${esc(p.text || '')}</p>
            ${p.uid === myUid || isOwner ? `<button class="btn small ghost" data-del-group-post="${esc(p.id)}">Apagar</button>` : ''}
          </div>`;
        }).join('') : '<div class="empty">Sem publicações ainda.</div>'}
        ${isMember ? `
          <form class="group-post-form" data-group-post-form="${esc(currentGroup.id)}">
            <textarea data-group-post-input rows="2" placeholder="Escreve algo no grupo…"></textarea>
            <button type="submit">Publicar</button>
          </form>` : ''}
      </div>`;
    box.style.display = '';
    $('#groups-list').style.display = 'none';
  }
  function closeGroupDetail() {
    currentGroup = null;
    groupMembers = [];
    if (groupMembersUnsub) { try { groupMembersUnsub(); } catch (e) {} groupMembersUnsub = null; }
    if (groupPostsUnsub) { try { groupPostsUnsub(); } catch (e) {} groupPostsUnsub = null; }
    $('#group-detail').style.display = 'none';
    $('#groups-list').style.display = '';
    renderGroupsList();
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async (e) => {
    const state = window.PICALTA_STATE;
    const openGroupBtn = e.target.closest('[data-open-group]');
    if (openGroupBtn) { e.preventDefault(); await openGroup(openGroupBtn.dataset.openGroup); return; }
    const joinBtn = e.target.closest('[data-join-group]');
    if (joinBtn) {
      e.preventDefault();
      try {
        await fsJoinGroup(joinBtn.dataset.joinGroup, state.me.uid);
        toast_('Entraste no grupo!');
      } catch (err) { toast_('Falha ao entrar: ' + (err.message || '')); }
      return;
    }
    const leaveBtn = e.target.closest('[data-leave-group]');
    if (leaveBtn) {
      e.preventDefault();
      try {
        await fsLeaveGroup(leaveBtn.dataset.leaveGroup, state.me.uid);
        toast_('Saíste do grupo');
        if (currentGroup && currentGroup.id === leaveBtn.dataset.leaveGroup) {
          closeGroupDetail();
        } else renderGroupsList();
      } catch (err) { toast_('Falha ao sair: ' + (err.message || '')); }
      return;
    }
    const backBtn = e.target.closest('[data-back-to-groups]');
    if (backBtn) { e.preventDefault(); closeGroupDetail(); return; }
    const delPostBtn = e.target.closest('[data-del-group-post]');
    if (delPostBtn && currentGroup) {
      e.preventDefault();
      if (!confirm('Apagar esta publicação do grupo?')) return;
      try {
        await fsRemoveGroupPost(currentGroup.id, delPostBtn.dataset.delGroupPost);
        toast_('Publicação apagada');
      } catch (err) { toast_('Falha ao apagar'); }
      return;
    }
  });

  document.addEventListener('submit', async (e) => {
    const state = window.PICALTA_STATE;
    const form = e.target.closest('[data-group-post-form]');
    if (!form || !currentGroup) return;
    e.preventDefault();
    const input = form.querySelector('[data-group-post-input]');
    const text = input.value.trim();
    if (!text) return;
    try {
      await fsAddGroupPost(currentGroup.id, state.me.uid, text, null);
      input.value = '';
      toast_('Publicado no grupo!');
    } catch (err) { toast_('Falha ao publicar: ' + (err.message || '')); }
  });

  $('#new-group-btn') && $('#new-group-btn').addEventListener('click', openCreateGroupModal);
  $('#cancel-group') && $('#cancel-group').addEventListener('click', closeCreateGroupModal);
  $('#publish-group') && $('#publish-group').addEventListener('click', async () => {
    const state = window.PICALTA_STATE;
    const name = $('#group-name').value.trim();
    const desc = $('#group-desc').value.trim();
    if (!name) { toast_('Dá um nome ao grupo'); return; }
    const btn = $('#publish-group');
    btn.disabled = true;
    try {
      const gid = await fsCreateGroup(state.me.uid, name, desc);
      // o criador entra automaticamente
      await fsJoinGroup(gid, state.me.uid);
      $('#new-group-modal').style.display = 'none';
      $('#group-name').value = '';
      $('#group-desc').value = '';
      toast_('Grupo criado!');
    } catch (err) { toast_('Falha ao criar: ' + (err.message || '')); }
    finally { btn.disabled = false; }
  });

  /* ---------- Init ---------- */
  window.PICALTA_GROUPS = {
    init() {
      const state = window.PICALTA_STATE;
      if (!groupsUnsub) {
        groupsUnsub = fsWatchGroups((snap) => {
          state.groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          renderGroupsList();
        });
      }
    },
    close() {
      if (groupsUnsub) { try { groupsUnsub(); } catch (e) {} groupsUnsub = null; }
      closeGroupDetail();
    },
  };
})();
