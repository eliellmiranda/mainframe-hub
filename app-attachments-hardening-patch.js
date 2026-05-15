/*!
 * MFHUB — Endurecimento de Anexos & Sincronização com Storage
 * Versão: 2026-05-15-mfhub-attach-harden-1
 *
 * Carregar APÓS:
 *   - supabase-config.js
 *   - app-manual-save.js
 *   - app.js
 *   - app-storage-supabase-patch.js
 *
 * O que faz:
 *   P0 — Avisa honestamente quando a nuvem está indisponível (não esconde
 *        que o arquivo ficou local) e marca itens como pendingUpload.
 *   P0 — Botão "Enviar" do modal espera a sessão Supabase hidratar.
 *   P0 — Fila de re-upload automática em background + ao voltar online +
 *        no clique da pílula de status.
 *   P1 — Migra anexos antigos (base64 inline em appData) para o bucket.
 *   P1 — Toast de progresso "Enviando N/Total" durante o upload.
 *   P1 — Pílula #cloud-sync-status reflete 3 estados: ok / pendente / offline.
 *   P2 — Validação de 50 MB no client.
 *   P2 — removeAttachment atômico + confirm estilizado (usa openModal).
 */
(() => {
  'use strict';
  const VERSION = '2026-05-15-mfhub-attach-harden-1';
  if (window.__MFHUB_ATTACH_HARDENING__) return;
  window.__MFHUB_ATTACH_HARDENING__ = { version: VERSION };

  const FN_URL = `${String(window.MFHUB_SUPABASE_URL || '').trim()}/functions/v1/site-storage`;
  const RETRY_INTERVAL_MS = 60 * 1000;
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

  // ---------- utilidades ----------
  function toast(msg) {
    if (typeof window.showToast === 'function') return window.showToast(msg);
    console.log('[MFHUB]', msg);
  }
  async function safeGetSession() {
    try {
      if (!window.supabaseClient?.auth?.getSession) return null;
      const { data, error } = await window.supabaseClient.auth.getSession();
      if (error) return null;
      return data?.session || null;
    } catch { return null; }
  }
  async function getToken() {
    const s = await safeGetSession();
    return s?.access_token || '';
  }
  function uidSafe() {
    return (typeof window.uid === 'function')
      ? window.uid()
      : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function dataUrlToFile(dataUrl, name, mime) {
    const m = /^data:([^;]+)?(?:;base64)?,(.*)$/.exec(dataUrl || '');
    if (!m) throw new Error('Data URL inválido.');
    const ct = mime || m[1] || 'application/octet-stream';
    const bin = atob(m[2]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name || 'arquivo', { type: ct });
  }

  // ---------- pílula de sincronização ----------
  function setSyncPill(state, detail) {
    const pill = document.getElementById('cloud-sync-status');
    if (!pill) return;
    const labels = {
      ok:        '✅ Nuvem sincronizada',
      pending:   `⏳ Pendentes${detail ? `: ${detail}` : ''}`,
      offline:   '❌ Nuvem offline',
      uploading: `↑ Enviando${detail ? ` ${detail}` : ''}`,
      local:     '☁ Nuvem local'
    };
    pill.textContent = labels[state] || labels.local;
    pill.dataset.syncState = state || '';
    pill.title =
      state === 'pending'  ? 'Há anexos aguardando envio. Clique para tentar agora.' :
      state === 'offline'  ? 'Sem conexão com a nuvem. Anexos ficam locais até a sessão voltar.' :
      state === 'ok'       ? 'Tudo sincronizado com o Supabase Storage.' :
                             'Status da sincronização com a nuvem.';
  }

  // ---------- confirm modal estilizado ----------
  function confirmModal(msg) {
    return new Promise(resolve => {
      if (typeof window.openModal !== 'function') return resolve(window.confirm(msg));
      window.__mfhubResolveConfirm__ = (val) => {
        try { window.closeModal && window.closeModal(); } catch {}
        window.__mfhubResolveConfirm__ = null;
        resolve(!!val);
      };
      window.openModal(
        'Confirmar',
        `<div class="muted" style="padding:8px 0">${msg}</div>`,
        `<button class="btn small" onclick="window.__mfhubResolveConfirm__ && window.__mfhubResolveConfirm__(false)">Cancelar</button>
         <button class="btn primary small" onclick="window.__mfhubResolveConfirm__ && window.__mfhubResolveConfirm__(true)">Confirmar</button>`
      );
    });
  }

  // ---------- chamadas ao Storage ----------
  async function fnUpload(file, category = 'attachment') {
    const token = await getToken();
    if (!token) throw new Error('Sessão Supabase indisponível.');
    const form = new FormData();
    form.set('action', 'upload');
    form.set('category', category);
    form.set('file', file, file.name || 'arquivo');
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const text = await res.text();
    let json = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || json?.ok === false) throw new Error(json?.error || text || 'Falha no upload.');
    return json;
  }
  async function fnDelete(path) {
    const token = await getToken();
    if (!token) throw new Error('Sessão Supabase indisponível.');
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', path })
    });
    const text = await res.text();
    let json = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Falha ao remover do bucket.');
    return true;
  }

  // ---------- enumeração de todos os holders ----------
  function* iterHolders() {
    const A = window.appData;
    if (!A) return;
    for (const c of (A.courses || [])) {
      for (const m of (c.modules || [])) {
        yield { holder: m, ctx: { type:'course-module', id1:c.id, id2:m.id, id3:'' } };
        for (const s of (m.submodules || []))
          yield { holder: s, ctx: { type:'course-submodule', id1:c.id, id2:s.id, id3:m.id } };
      }
    }
    for (const d of (A.docs || []))    yield { holder: d, ctx: { type:'doc', id1:d.id } };
    for (const d of (A.manuals || [])) yield { holder: d, ctx: { type:'manual', id1:d.id } };
    const subs = {
      codeSpaces:      'code-subspace',
      exerciseSpaces:  'exercise-subspace',
      interviewSpaces: 'interview-subspace'
    };
    for (const k of Object.keys(subs)) {
      for (const s of (A[k] || []))
        for (const ss of (s.subspaces || []))
          yield { holder: ss, ctx: { type: subs[k], id1: s.id, id2: ss.id, id3: '' } };
    }
  }
  function countPending() {
    let n = 0;
    for (const { holder } of iterHolders())
      for (const att of (holder.attachments || []))
        if (att.pendingUpload && att.data && !att.storagePath) n++;
    return n;
  }

  // ---------- saveUploads endurecido ----------
  async function addAsPending(holder, file, errMsg = '') {
    const reader = new FileReader();
    const data = await new Promise((resolve, reject) => {
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    holder.attachments.push({
      id: uidSafe(),
      name: file.name,
      type: file.type || '',
      size: Number(file.size || 0),
      data,
      pendingUpload: true,
      uploadError: errMsg || '',
      createdAt: Date.now(),
      cloud: false
    });
  }

  window.saveUploads = async function hardenedSaveUploads(type, id1, id2 = '', id3 = '') {
    if (typeof window.resolveAttachmentHolder !== 'function')
      return toast('Estrutura de anexos indisponível.');
    const holder = window.resolveAttachmentHolder(type, id1, id2, id3);
    if (!holder) return toast('Local de anexos não encontrado.');
    const input = document.getElementById('up-files');
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    holder.attachments = holder.attachments || [];
    if (holder.attachments.length + files.length > 5)
      return alert('O limite é de até 5 arquivos por espaço.');
    const oversized = files.filter(f => f.size > MAX_FILE_BYTES);
    if (oversized.length)
      return alert(`Arquivos acima de 50 MB não são aceitos:\n${oversized.map(f => f.name).join('\n')}`);

    const session = await safeGetSession();
    let cloudCount = 0;
    let localCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (session?.access_token) {
        try {
          setSyncPill('uploading', `${i + 1}/${files.length}`);
          toast(`Enviando ${i + 1}/${files.length}: ${file.name}`);
          const up = await fnUpload(file, 'attachment');
          holder.attachments.push({
            id: uidSafe(),
            name: file.name,
            type: file.type || '',
            size: Number(file.size || 0),
            storagePath: up?.path || '',
            createdAt: Date.now(),
            cloud: true
          });
          cloudCount++;
        } catch (err) {
          console.error('[MFHUB] upload falhou, marcando como pendente:', err);
          await addAsPending(holder, file, err?.message);
          localCount++;
        }
      } else {
        await addAsPending(holder, file, 'Sessão indisponível no momento do envio.');
        localCount++;
      }
    }

    try { window.saveUserData && window.saveUserData({ reason: 'Anexou arquivos' }); } catch {}
    try { window.closeModal && window.closeModal(); } catch {}
    try { window.renderAll && window.renderAll(); } catch {}

    const pendings = countPending();
    if (pendings === 0) {
      setSyncPill('ok');
      toast(`Anexos enviados à nuvem (${cloudCount}).`);
    } else {
      setSyncPill('pending', `${pendings} anexo(s)`);
      toast(localCount === files.length
        ? `Nuvem indisponível — ${localCount} anexo(s) salvo(s) localmente. Vou reenviar em segundo plano.`
        : `${cloudCount} na nuvem, ${localCount} ficaram locais — reenvio automático em segundo plano.`);
    }
  };

  // ---------- retry da fila de pendentes ----------
  let retryRunning = false;
  async function retryPending(showFeedback = false) {
    if (retryRunning) return;
    retryRunning = true;
    try {
      const session = await safeGetSession();
      const pendingNow = countPending();
      if (!session?.access_token) {
        setSyncPill(pendingNow ? 'pending' : 'offline', pendingNow ? `${pendingNow} anexo(s)` : '');
        if (showFeedback) toast('Sem sessão ativa — faça login para sincronizar.');
        return;
      }
      const tasks = [];
      for (const { holder } of iterHolders())
        for (const att of (holder.attachments || []))
          if (att.pendingUpload && att.data && !att.storagePath) tasks.push({ holder, att });
      if (!tasks.length) { setSyncPill('ok'); return; }
      let done = 0;
      for (const { att } of tasks) {
        try {
          setSyncPill('uploading', `${++done}/${tasks.length}`);
          const file = dataUrlToFile(att.data, att.name, att.type);
          const up = await fnUpload(file, 'attachment');
          att.storagePath = up?.path || '';
          att.size = att.size || file.size;
          delete att.data;
          delete att.pendingUpload;
          delete att.uploadError;
          att.cloud = true;
        } catch (err) {
          att.uploadError = err?.message || 'Falha no reenvio.';
        }
      }
      try { window.saveUserData && window.saveUserData({ reason: 'Reenvio de anexos pendentes' }); } catch {}
      try { window.renderAll && window.renderAll(); } catch {}
      const remaining = countPending();
      setSyncPill(remaining ? 'pending' : 'ok', remaining ? `${remaining} anexo(s)` : '');
      if (showFeedback)
        toast(remaining ? `Ainda restam ${remaining} pendente(s).` : 'Tudo sincronizado!');
    } finally {
      retryRunning = false;
    }
  }
  window.__mfhubRetryPendingAttachments = (sf) => retryPending(sf !== false);

  // ---------- migração de base64 legado ----------
  async function migrateLegacyBase64(showFeedback = false) {
    const session = await safeGetSession();
    if (!session?.access_token) return;
    const tasks = [];
    for (const { holder } of iterHolders())
      for (const att of (holder.attachments || []))
        if (att.data && !att.storagePath && !att.pendingUpload) tasks.push({ holder, att });
    if (!tasks.length) return;
    let done = 0;
    for (const { att } of tasks) {
      try {
        setSyncPill('uploading', `migrando ${++done}/${tasks.length}`);
        const file = dataUrlToFile(att.data, att.name, att.type);
        const up = await fnUpload(file, 'attachment');
        att.storagePath = up?.path || '';
        att.size = att.size || file.size;
        delete att.data;
        att.cloud = true;
      } catch (err) {
        att.pendingUpload = true;
        att.uploadError = err?.message || 'Falha na migração.';
      }
    }
    try { window.saveUserData && window.saveUserData({ reason: 'Migração de anexos legados' }); } catch {}
    try { window.renderAll && window.renderAll(); } catch {}
    const remaining = countPending();
    setSyncPill(remaining ? 'pending' : 'ok', remaining ? `${remaining} anexo(s)` : '');
    if (showFeedback) toast('Anexos legados migrados para a nuvem.');
  }
  window.__mfhubMigrateLegacyAttachments = (sf) => migrateLegacyBase64(sf !== false);

  // ---------- uploadAttachmentsModal: botão depende da sessão ----------
  const previousUploadModal = window.uploadAttachmentsModal;
  window.uploadAttachmentsModal = function hardenedUploadModal(type, id1, id2 = '', id3 = '') {
    if (typeof previousUploadModal === 'function') previousUploadModal(type, id1, id2, id3);
    const input = document.getElementById('up-files');
    if (input) input.title = 'Tamanho máximo por arquivo: 50 MB.';
    const footBtn = document.querySelector('#modal-foot button.primary');
    if (!footBtn) return;
    const labelOriginal = footBtn.textContent;
    footBtn.disabled = true;
    footBtn.textContent = 'Aguardando sessão...';
    safeGetSession().then(s => {
      if (s?.access_token) {
        footBtn.disabled = false;
        footBtn.textContent = labelOriginal;
      } else {
        footBtn.disabled = false;
        footBtn.textContent = 'Salvar local (offline)';
        footBtn.title = 'Sem sessão na nuvem — arquivos ficarão locais e serão enviados quando voltar.';
      }
    });
  };

  // ---------- removeAttachment atômico + confirm estilizado ----------
  window.removeAttachment = async function hardenedRemove(type, id1, id2, fileId, id3 = '') {
    if (typeof window.getAttachmentRecord !== 'function')
      return toast('Estrutura de anexos indisponível.');
    const rec = window.getAttachmentRecord(type, id1, id2, fileId, id3);
    if (!rec?.file || !rec?.holder) return toast('Arquivo não encontrado.');
    const ok = await confirmModal(`Excluir o arquivo "${rec.file.name}"?`);
    if (!ok) return;
    const remotePath = rec.file.storagePath || '';
    let removedRemote = false;
    try {
      if (remotePath) {
        await fnDelete(remotePath);
        removedRemote = true;
      }
      rec.holder.attachments = (rec.holder.attachments || []).filter(a => a.id !== fileId);
      window.saveUserData && window.saveUserData({
        reason: removedRemote ? 'Removeu anexo da nuvem' : 'Removeu anexo local'
      });
      window.renderAll && window.renderAll();
      toast('Arquivo removido.');
    } catch (err) {
      console.error('[MFHUB] remove falhou:', err);
      toast(err?.message || 'Falha ao remover. Tente novamente.');
    }
  };

  // ---------- click na pílula = retry manual ----------
  function bindPillClick() {
    const pill = document.getElementById('cloud-sync-status');
    if (!pill || pill.__mfhubBound) return;
    pill.__mfhubBound = true;
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', () => retryPending(true));
  }

  // ---------- inicialização ----------
  async function boot() {
    bindPillClick();
    let tries = 0;
    while (!window.appData && tries < 40) {
      await new Promise(r => setTimeout(r, 250));
      tries++;
    }
    const session = await safeGetSession();
    const pendingNow = countPending();
    setSyncPill(
      session?.access_token ? (pendingNow ? 'pending' : 'ok') : 'offline',
      pendingNow ? `${pendingNow} anexo(s)` : ''
    );
    if (session?.access_token) {
      setTimeout(() => retryPending(false), 3000);
      setTimeout(() => migrateLegacyBase64(false), 8000);
    }
    setInterval(() => retryPending(false), RETRY_INTERVAL_MS);
    window.addEventListener('online',  () => retryPending(true));
    window.addEventListener('offline', () => setSyncPill('offline'));
    console.log(`[MFHUB] attach-hardening ${VERSION} carregado.`);
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();
})();