/* Picalta — PicalAi: assistente de IA via função serverless da Vercel (api/picalai.js)
 * O browser nunca vê a chave da IA — apenas chama /api/picalai/* no mesmo servidor.
 * Requer um token Firebase (header X-Firebase-Token) — o servidor valida.
 */
'use strict';

(function () {
  /* estado local do módulo (histórico e status), não usa o state global do app */
  let history = [];
  let status = null; // { configured, model }
  let sending = false;

  const $ = (s) => document.querySelector(s);

  function ensureUi() {
    // A vista "IA" já existe no index.html; liga os listeners uma vez.
    if (ensureUi._done) return;
    ensureUi._done = true;
    $('#ai-form').addEventListener('submit', onSubmit);
    $('#ai-clear-btn').addEventListener('click', () => {
      history = [];
      renderMessages();
      $('#ai-intro').style.display = '';
    });
  }

  /* ---------- Firebase ID token (auth, exigido pelo servidor) ---------- */
  async function getIdToken() {
    try {
      // fbGetIdToken é definido em firebase.js
      if (typeof fbGetIdToken === 'function') return await fbGetIdToken();
    } catch (e) {}
    return null;
  }

  /* ---------- API base (funciona local e no preview via proxy) ---------- */
  // Mesmo domínio por defeito. Para apontar a outro servidor, define
  // window.__PICALTA_API_BASE = 'https://...' antes de carregar este script.
  const API_BASE = (typeof window.__PICALTA_API_BASE === 'string') ? window.__PICALTA_API_BASE : '';
  function apiUrl(path) { return API_BASE + path; }

  /* Lê JSON com tolerância: uma página HTML (404 do hosting) não rebenta o chat */
  async function readJson(r) {
    const raw = await r.text();
    try { return JSON.parse(raw); } catch (e) { return { __notJson: true, message: '' }; }
  }
  const NO_BACKEND = 'A função /api/picalai só existe quando o site está na Vercel (ou com "vercel dev" / "npm run dev"). Neste endereço não há servidor de IA.';

  async function refreshStatus() {
    const el = $('#ai-status');
    if (!el) return;
    if (window.PICALTA_DEMO) { el.textContent = 'Indisponível na demonstração'; status = null; return; }
    el.title = '';
    try {
      const token = await getIdToken();
      const r = await fetch(apiUrl('/api/picalai/status'), { method: 'GET', headers: { 'X-Firebase-Token': token || '' } });
      const j = await readJson(r);
      if (j.__notJson || typeof j.configured !== 'boolean') {
        status = { configured: false, noBackend: true };
        el.textContent = 'sem servidor de IA neste endereço';
        el.title = NO_BACKEND;
        el.style.color = 'var(--color-accent)';
        return;
      }
      status = j;
      if (!j.configured) {
        const miss = (j.missing || []).join(', ');
        el.textContent = 'falta configurar' + (miss ? ': ' + miss : '');
        el.title = 'Define estas variáveis em Vercel > Settings > Environment Variables e faz Redeploy.';
        el.style.color = 'var(--color-accent)';
      } else {
        el.textContent = 'ativo · ' + j.model;
        el.style.color = 'var(--color-primary)';
      }
    } catch (e) {
      el.textContent = 'servidor inacessível';
      el.title = 'Não foi possível contactar /api/picalai/status. Confirma a ligação.';
      el.style.color = 'var(--color-text-faint)';
      status = null;
    }
  }

  function renderMessages() {
    const box = $('#ai-messages');
    if (!box) return;
    if (!history.length) { box.innerHTML = ''; return; }
    box.innerHTML = history.map((m) => `
      <div class="bubble ${m.role === 'user' ? 'mine' : 'theirs'}">${escapeHtml_(m.content)}</div>
    `).join('');
    box.scrollTop = box.scrollHeight;
  }

  function showTyping() {
    const box = $('#ai-messages');
    const div = document.createElement('div');
    div.className = 'bubble theirs ai-typing';
    div.id = 'ai-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function hideTyping() {
    const el = document.getElementById('ai-typing');
    if (el) el.remove();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const input = $('#ai-input');
    const text = input.value.trim();
    if (!text) return;

    if (window.PICALTA_DEMO) { toast_('A PicalAi não está disponível na demonstração.'); return; }
    // O estado é só informativo: tenta sempre enviar e mostra a razão exata se falhar.
    if (!status || status.noBackend) await refreshStatus();
    if (status && status.noBackend) { toast_(NO_BACKEND); return; }

    // guarda o texto do input para restaurar em caso de falha
    const originalText = text;
    input.value = '';
    $('#ai-intro').style.display = 'none';
    history.push({ role: 'user', content: text });
    renderMessages();
    showTyping();
    sending = true;
    const btn = $('#ai-send-btn');
    btn.disabled = true; btn.textContent = '…';

    try {
      const token = await getIdToken();
      const state = window.PICALTA_STATE; // lido agora (app.js já correu)
      const userName = state && state.profile && state.profile.name ? state.profile.name : '';
      const r = await fetch(apiUrl('/api/picalai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-Token': token || '',
        },
        body: JSON.stringify({ messages: history, userName }),
      });
      const j = await readJson(r);
      if (j.__notJson) throw new Error(r.status === 404 ? NO_BACKEND : 'Resposta inesperada do servidor (HTTP ' + r.status + ').');
      if (!r.ok) throw new Error(j.message || 'Falha (HTTP ' + r.status + ')');
      if (!j.reply) throw new Error('A IA devolveu uma resposta vazia.');
      history.push({ role: 'assistant', content: j.reply });
      renderMessages();
    } catch (err) {
      hideTyping();
      // remove a mensagem do utilizador do histórico E restaura no input, para ele reenviar
      if (history.length && history[history.length - 1].role === 'user') history.pop();
      renderMessages();
      input.value = originalText; // mantém o texto
      input.focus();
      toast_('PicalAi: ' + (err.message || 'erro'));
    } finally {
      hideTyping();
      sending = false;
      btn.disabled = false; btn.textContent = 'Enviar';
    }
  }

  /* helpers */
  function escapeHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&' + '#39;');
  }
  function toast_(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast_._t);
    toast_._t = setTimeout(() => t.classList.remove('show'), 6000);
  }

  /* API exposta ao app.js */
  window.PICALAI = {
    init() {
      ensureUi();
      refreshStatus();
    },
    refreshStatus,
  };
})();
