/*!
 * MFHUB — Performance da Sincronização com a Nuvem
 * Versão: 2026-05-15-mfhub-cloudperf-1
 *
 * Carregar APÓS app-attachments-hardening-patch.js
 *
 * Resolve o "Nuvem salvando..." piscando o tempo todo e
 * uploads gigantes a cada toque:
 *  1. Sobe debounce de 700ms para 6000ms (configurável abaixo).
 *  2. Pula sync se o payload não mudou (hash simples).
 *  3. Silencia status visual durante a maior parte da janela:
 *     só mostra "Nuvem salvando..." quando realmente está enviando,
 *     e só por > 800ms (evita o flicker).
 *  4. Bloqueia syncs até a sessão estar pronta (sem disparar
 *     RPC vazio enquanto o auth não hidratou).
 */
(() => {
  'use strict';
  const VERSION = '2026-05-15-mfhub-cloudperf-1';
  if (window.__MFHUB_CLOUDPERF__) return;
  window.__MFHUB_CLOUDPERF__ = { version: VERSION };

  // ===== Configuração =====
  const DEBOUNCE_MS         = 6000;   // 700ms -> 6s
  const STATUS_REVEAL_MS    = 800;    // só mostra "salvando" se demorar mais que isso
  const SESSION_WAIT_MS     = 250;    // intervalo de re-checagem de sessão

  let timer        = null;
  let inFlight     = false;
  let queued       = false;
  let lastHash     = '';
  let statusTimer  = null;

  // ---- hash barato pra detectar mudança real ----
  function djb2(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }
  function hashOfAppData() {
    try {
      const A = window.appData || {};
      // Inclui campos visíveis ao usuário; ignora timestamps voláteis.
      const snap = {
        courses: A.courses, docs: A.docs, manuals: A.manuals,
        codeSpaces: A.codeSpaces, exerciseSpaces: A.exerciseSpaces,
        interviewSpaces: A.interviewSpaces, linkedinPosts: A.linkedinPosts,
        certificates: A.certificates, generalNotes: A.generalNotes,
        tools: A.tools, reminders: A.reminders, dailyGoals: A.dailyGoals,
        lab: A.lab, profile: A.profile
      };
      return djb2(JSON.stringify(snap));
    } catch { return String(Date.now()); }
  }

  // ---- status discreto: só mostra se demorar ----
  function setStatusDelayed(msg) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      if (typeof window.setCloudStatus === 'function')
        window.setCloudStatus('syncing', msg || 'Nuvem salvando…');
    }, STATUS_REVEAL_MS);
  }
  function setStatusImmediate(state, msg) {
    clearTimeout(statusTimer);
    statusTimer = null;
    if (typeof window.setCloudStatus === 'function')
      window.setCloudStatus(state, msg);
  }

  async function waitSession(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await window.supabaseClient?.auth?.getSession?.();
        if (r?.data?.session?.access_token) return r.data.session;
      } catch {}
      await new Promise(r => setTimeout(r, SESSION_WAIT_MS));
    }
    return null;
  }

  // ---- substitui scheduleCloudSync ----
  window.scheduleCloudSync = function patchedScheduleCloudSync(reason = 'change') {
    if (!window.currentUser) return;
    if (typeof window.canUseCloudSync === 'function' && !window.canUseCloudSync()) {
      setStatusImmediate('local', 'Nuvem local');
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => runFlush(reason), DEBOUNCE_MS);
  };

  async function runFlush(reason) {
    if (inFlight) { queued = true; return; }
    if (typeof window.canUseCloudSync === 'function' && !window.canUseCloudSync()) {
      setStatusImmediate('local', 'Nuvem local');
      return;
    }
    const session = await waitSession();
    if (!session) {
      setStatusImmediate('local', 'Sem sessão');
      return;
    }
    const h = hashOfAppData();
    if (h === lastHash) {
      // Nada mudou de verdade — pula upload, status volta a "sincronizado".
      setStatusImmediate('synced', 'Nuvem ✓');
      return;
    }
    inFlight = true;
    setStatusDelayed('Nuvem salvando…');
    try {
      if (typeof window.pushCloudState !== 'function') {
        console.warn('[MFHUB] pushCloudState ausente — sync ignorada.');
        return;
      }
      const ok = await window.pushCloudState(reason);
      if (ok !== false) {
        lastHash = h;
        setStatusImmediate('synced', 'Nuvem ✓');
      } else {
        setStatusImmediate('error', 'Nuvem falha');
      }
    } catch (err) {
      console.error('[MFHUB] cloud sync erro:', err);
      setStatusImmediate('error', 'Nuvem falha');
      if (typeof window.showToast === 'function')
        window.showToast('Falha na nuvem: ' + (err?.message || 'erro desconhecido'));
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        // novo agendamento, mas com debounce inteiro novamente
        window.scheduleCloudSync('queued');
      }
    }
  }

  // Inicializa o hash com o estado atual depois que appData existir.
  (async function initHash() {
    let tries = 0;
    while (!window.appData && tries < 40) {
      await new Promise(r => setTimeout(r, 250));
      tries++;
    }
    lastHash = hashOfAppData();
    console.log(`[MFHUB] cloud-perf ${VERSION} carregado. debounce=${DEBOUNCE_MS}ms`);
  })();
})();