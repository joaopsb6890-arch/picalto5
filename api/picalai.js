/* PicalAi proxy — Vercel Serverless Function (Node runtime, CommonJS)
 *
 * Ficheiro: /api/picalai.js  → servido em /api/picalai
 *
 * Este único ficheiro trata /api/picalai/status e /api/picalai/chat
 * (o vercel.json faz o rewrite de ambos para /api/picalai).
 * A escolha da ação é feita pelo MÉTODO HTTP (GET = estado, POST = chat),
 * não pelo caminho, porque req.url pode variar com os rewrites.
 */
'use strict';

const AI_TIMEOUT_MS = 25000; // < maxDuration (30s) do vercel.json
const AUTH_TIMEOUT_MS = 4000;  // orçamento de tempo para verificar o token Firebase
const AI_MAX_MESSAGES = 24;
const AI_MAX_USER_TOKENS = 1200;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 15;

function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // O AbortController mantém-se ativo durante o fetch E a leitura do corpo/json.
  // O temporizador só é limpo quando a promessa externa (corpo incluído) termina.
  return fetch(url, { ...opts, signal: controller.signal }).then(async (r) => {
    // clona o corpo para que o abort ainda o alcance se demorar a chegar
    const clone = r.clone();
    const text = await clone.text(); // lê o corpo sob o mesmo sinal
    return new Response(text, {
      status: r.status,
      statusText: r.statusText,
      headers: Object.fromEntries(r.headers.entries()),
    });
  }).finally(() => clearTimeout(timer));
}

function json(res, status, obj) {
  res.status(status).json(obj);
}

function aiConfigured() {
  return !!(process.env.OVERCONTROL_API_KEY && process.env.OVERCONTROL_BASE_URL && process.env.OVERCONTROL_MODEL);
}

async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    const key = process.env.FIREBASE_API_KEY || 'AIzaSyDtSLwYJDiL-1AOnwLDh-jxOQzG1xsDsHs';
    const r = await fetchWithTimeout(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
      AUTH_TIMEOUT_MS
    );
    if (!r.ok) return null;
    const j = await r.json();
    const u = j.users && j.users[0];
    if (!u) return null;
    return { uid: u.localId, email: u.email || null, name: u.displayName || null };
  } catch (e) {
    // abort por timeout ou falha de rede — não faz sentido a IA esperar mais
    return null;
  }
}

const rateBuckets = new Map();
function rateAllow(key) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.ts > RATE_WINDOW_MS) { b = { ts: now, n: 0 }; rateBuckets.set(key, b); }
  b.n += 1;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.ts > RATE_WINDOW_MS) rateBuckets.delete(k);
  }
  return b.n <= RATE_MAX;
}

function picalaiSystemPrompt(userName) {
  return [
    'És a PicalAi, a assistente de IA da rede social Picalta.',
    'Responde sempre em português de Portugal, com frases curtas, simpáticas e diretas.',
    'Podes conversar sobre qualquer assunto, mas o contexto é uma rede social de fotos/conversas/jogos/música/grupos.',
    'Se não souberes algo com certeza, admite-o em vez de inventar.',
    'Nunca fales da tua chave de API nem de detalhes técnicos do servidor.',
    userName ? `O nome do utilizador atual é ${userName}.` : '',
  ].filter(Boolean).join(' ');
}

async function callAi(messages, userName) {
  const base = process.env.OVERCONTROL_BASE_URL.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const payload = {
      model: process.env.OVERCONTROL_MODEL,
      messages: [
        { role: 'system', content: picalaiSystemPrompt(userName) },
        ...messages.slice(-AI_MAX_MESSAGES),
      ],
      max_tokens: AI_MAX_USER_TOKENS,
      temperature: 0.6,
    };
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + process.env.OVERCONTROL_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 400);
      try {
        const j = JSON.parse(text);
        detail = (j.error && j.error.message) || (j.message) || detail;
      } catch (e) {}
      const err = new Error('upstream ' + res.status + ': ' + detail);
      err.publicMsg = res.status === 401 || res.status === 403
        ? 'A chave da IA foi recusada pelo serviço. Verifica se ainda é válida e se o endpoint está correto.'
        : 'O serviço de IA recusou o pedido (HTTP ' + res.status + '). Tenta novamente.';
      throw err;
    }
    const parsed = JSON.parse(text);
    const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
    if (!content) {
      const err = new Error('empty response');
      err.publicMsg = 'A IA devolveu uma resposta vazia. Tenta outra vez.';
      throw err;
    }
    return { content: String(content) };
  } finally {
    clearTimeout(timer);
  }
}

/* Vercel Node handler */
module.exports = async function handler(req, res) {
  try {
    const path = req.url || '';
    const firebaseToken = String(req.headers['x-firebase-token'] || '').trim();

    // GET — estado (público: só revela configurado sim/não)
    if (req.method === 'GET') {
      return json(res, 200, {
        configured: aiConfigured(),
        model: aiConfigured() ? process.env.OVERCONTROL_MODEL : null,
      });
    }

    // POST — chat
    if (req.method === 'POST') {
      const fbUser = await verifyFirebaseToken(firebaseToken);
      if (!fbUser) {
        return json(res, 401, { error: 'unauthorized', message: 'Precisas de estar autenticado para falar com a PicalAi.' });
      }
      if (!aiConfigured()) {
        return json(res, 503, {
          error: 'not_configured',
          message: 'O PicalAi não está configurado. Define OVERCONTROL_API_KEY, OVERCONTROL_BASE_URL e OVERCONTROL_MODEL no Vercel.',
        });
      }
      if (!rateAllow('uid:' + fbUser.uid)) {
        return json(res, 429, { error: 'rate_limited', message: 'Demasiados pedidos. Espera um momento.' });
      }
      let body = req.body;
      if (!body || typeof body === 'string') {
        try { body = JSON.parse(body || '{}'); } catch (e) { return json(res, 400, { error: 'bad_json', message: 'Corpo inválido.' }); }
      }
      if (!Array.isArray(body.messages) || !body.messages.length) {
        return json(res, 400, { error: 'bad_request', message: 'Falta o histórico de mensagens.' });
      }
      const clean = body.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-AI_MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!clean.length) return json(res, 400, { error: 'bad_request', message: 'Mensagens inválidas.' });
      const userName = typeof body.userName === 'string' ? body.userName.slice(0, 40) : (fbUser.name || '');
      try {
        const out = await callAi(clean, userName);
        return json(res, 200, { reply: out.content });
      } catch (e) {
        const msg = (e && e.publicMsg) || 'Falha ao falar com a PicalAi. Tenta novamente.';
        console.error('[Picalta][ai]', e && e.message);
        return json(res, 502, { error: 'ai_error', message: msg });
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'method_not_allowed', message: 'Método não suportado: ' + req.method + ' ' + path });
  } catch (e) {
    console.error('[Picalta][server]', e && e.message);
    return json(res, 500, { error: 'server', message: 'Erro interno.' });
  }
};
