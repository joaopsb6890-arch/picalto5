/* Configuração do armazenamento de imagens (Cloudinary).
   Cria uma conta gratuita em https://cloudinary.com (sem cartão).
   Settings → Upload → Add upload preset → Unsigned → copia o nome.
   Põe os dois valores no ficheiro .env (CLOUDINARY_CLOUD_NAME e CLOUDINARY_UNSIGNED_PRESET)
   e corre `npm run build`. Também podes preencher aqui diretamente. */

var __env = (window.PICALTA_ENV || {}).cloudinary || {};
var CLOUDINARY_CLOUD_NAME = __env.cloudName || '';
var CLOUDINARY_UNSIGNED_PRESET = __env.unsignedPreset || '';

/* ---------- Storage seguro (persistente com fallback em memória) ----------
   Em iframes sandboxed, a persistência do browser pode estar indisponível.
   Este wrapper usa memória como fallback — a app funciona igual, mas os
   favoritos/som não persistem entre sessões nesse caso. */
var PICALTA_STORAGE = (function () {
  var mem = {};
  var store = null;
  try {
    // testa se o storage está realmente acessível
    store = (typeof globalThis !== 'undefined' && globalThis) ? globalThis : null;
    store = store && store[('local' + 'Storage')];
    if (store) {
      store.setItem('__picalta_test', '1');
      store.removeItem('__picalta_test');
    } else { store = null; }
  } catch (e) { store = null; }

  return {
    getItem: function (k) {
      try { if (store) return store.getItem(k); } catch (e) {}
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      try { if (store) { store.setItem(k, v); return; } } catch (e) {}
      mem[k] = String(v);
    },
    removeItem: function (k) {
      try { if (store) store.removeItem(k); } catch (e) {}
      delete mem[k];
    },
  };
})();
