(() => {
  'use strict';

  const PATCH_VERSION = '2026-04-16-storage-supabase-mfhub-fix1-lite';
  if (window.__MFHUB_STORAGE_SUPABASE_PATCH__) return;
  window.__MFHUB_STORAGE_SUPABASE_PATCH__ = { version: PATCH_VERSION };

  const STORAGE_FUNCTION_URL = `${String(window.MFHUB_SUPABASE_URL || '').trim()}/functions/v1/site-storage`;
  const signedUrlCache = new Map();

  function isReady() {
    return !!(window.supabase && window.MFHUB_SUPABASE_URL && window.MFHUB_SUPABASE_ANON_KEY && typeof supabaseClient !== 'undefined' && supabaseClient);
  }

  function isStoragePath(value) {
    return typeof value === 'string' && value.includes('/') && !/^data:/i.test(value);
  }

  async function getAccessToken() {
    if (!isReady() || !supabaseClient?.auth?.getSession) {
      throw new Error('Sessão do Supabase indisponível.');
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token || '';
    if (!token) throw new Error('Sessão do Supabase ausente.');
    return token;
  }

  async function storageJson(action, payload = {}) {
    const token = await getAccessToken();
    const res = await fetch(STORAGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, ...payload })
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || text || 'Falha ao acessar o Storage.');
    }
    return json;
  }

  async function storageUpload(file, category = 'attachment', oldPath = '') {
    const token = await getAccessToken();
    const form = new FormData();
    form.set('action', 'upload');
    form.set('category', category);
    if (oldPath) form.set('oldPath', oldPath);
    form.set('file', file, file.name || 'arquivo');
    const res = await fetch(STORAGE_FUNCTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || text || 'Falha ao enviar arquivo para o Storage.');
    }
    if (json?.path && json?.signedUrl) {
      signedUrlCache.set(json.path, { url: json.signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 });
    }
    return json;
  }

  async function signPath(path, downloadName = '') {
    if (!path) return '';
    const cached = signedUrlCache.get(path);
    if (cached?.url && cached.expiresAt > Date.now()) return cached.url;
    const json = await storageJson('sign', { path, downloadName });
    if (json?.url) signedUrlCache.set(path, { url: json.url, expiresAt: Date.now() + 50 * 60 * 1000 });
    return json?.url || '';
  }

  async function deletePath(path) {
    if (!path) return false;
    await storageJson('delete', { path });
    signedUrlCache.delete(path);
    return true;
  }

  function resolveRemoteFilePath(file) {
    if (!file || typeof file !== 'object') return '';
    const candidates = [file.storagePath, file.path, file.filePath, file.remotePath, file.assetPath, file.assetId];
    for (const value of candidates) {
      if (isStoragePath(value)) return String(value);
    }
    return '';
  }

  function resolveInlineFileHref(file) {
    if (!file || typeof file !== 'object') return '';
    const candidates = [file.data, file.url, file.previewUrl, file.href];
    for (const value of candidates) {
      const href = String(value || '').trim();
      if (!href) continue;
      if (/^(data:|blob:|https?:)/i.test(href)) return href;
    }
    return '';
  }

  const originalOpenAttachment = typeof openAttachment === 'function' ? openAttachment : null;
  const originalDownloadAttachment = typeof downloadAttachment === 'function' ? downloadAttachment : null;
  const originalRemoveAttachment = typeof removeAttachment === 'function' ? removeAttachment : null;
  const originalSaveUploads = typeof saveUploads === 'function' ? saveUploads : null;

  openAttachment = async function patchedOpenAttachment(type, id1, id2, fileId, id3 = '') {
    const rec = getAttachmentRecord(type, id1, id2, fileId, id3);
    const file = rec?.file;
    if (!file) return showToast('Arquivo não encontrado.');
    try {
      const remotePath = resolveRemoteFilePath(file);
      if (remotePath) {
        const href = await signPath(remotePath, file.name || 'arquivo');
        if (!href) return showToast('Arquivo não encontrado.');
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const inlineHref = resolveInlineFileHref(file);
      if (inlineHref) {
        const a = document.createElement('a');
        a.href = inlineHref;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      if (typeof originalOpenAttachment === 'function') return await originalOpenAttachment.apply(this, arguments);
      return showToast('Arquivo não encontrado.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível abrir o arquivo.');
    }
  };

  downloadAttachment = async function patchedDownloadAttachment(type, id1, id2, fileId, id3 = '') {
    const rec = getAttachmentRecord(type, id1, id2, fileId, id3);
    const file = rec?.file;
    if (!file) return showToast('Arquivo não encontrado.');
    try {
      const remotePath = resolveRemoteFilePath(file);
      if (remotePath) {
        const href = await signPath(remotePath, file.name || 'arquivo');
        if (!href) return showToast('Arquivo não encontrado.');
        const a = document.createElement('a');
        a.href = href;
        a.download = file.name || 'arquivo';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const inlineHref = resolveInlineFileHref(file);
      if (inlineHref) {
        const a = document.createElement('a');
        a.href = inlineHref;
        a.download = file.name || 'arquivo';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      if (typeof originalDownloadAttachment === 'function') return await originalDownloadAttachment.apply(this, arguments);
      return showToast('Arquivo não encontrado.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível baixar o arquivo.');
    }
  };

  removeAttachment = async function patchedRemoveAttachment(type, id1, id2, fileId, id3 = '') {
    const rec = getAttachmentRecord(type, id1, id2, fileId, id3);
    const holder = rec?.holder;
    const file = rec?.file;
    if (!holder || !file) return showToast('Arquivo não encontrado.');
    if (!confirm(`Excluir o arquivo "${file.name}"?`)) return;
    try {
      const remotePath = resolveRemoteFilePath(file);
      if (remotePath) {
        await deletePath(remotePath);
      }
      holder.attachments = (holder.attachments || []).filter(item => item.id !== fileId);
      saveUserData({ reason: remotePath ? 'Removeu anexo do Storage' : 'Removeu anexo local' });
      renderAll();
      showToast('Arquivo removido.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível remover o arquivo.');
    }
  };

  saveUploads = async function patchedSaveUploads(type, id1, id2 = '', id3 = '') {
    const holder = resolveAttachmentHolder(type, id1, id2, id3);
    if (!holder) return;
    const input = document.getElementById('up-files');
    const files = Array.from(input?.files || []);
    holder.attachments ||= [];
    if (!files.length) return;
    if (holder.attachments.length + files.length > 5) return alert('O limite é de até 5 arquivos.');

    if (!isReady()) {
      if (typeof originalSaveUploads === 'function') return await originalSaveUploads.apply(this, arguments);
      return showToast('Storage indisponível neste build.');
    }

    try {
      for (const file of files) {
        const uploaded = await storageUpload(file, 'attachment');
        holder.attachments.push({
          id: uid(),
          name: file.name,
          type: file.type || '',
          size: Number(file.size || 0),
          storagePath: uploaded.path || '',
          createdAt: Date.now()
        });
      }
      saveUserData({ reason: 'Anexou arquivos ao Storage' });
      closeModal();
      renderAll();
      showToast('Arquivos anexados ao Storage.');
    } catch (err) {
      console.error(err);
      if (typeof originalSaveUploads === 'function') {
        try { return await originalSaveUploads.apply(this, arguments); } catch {}
      }
      showToast(err?.message || 'Falha ao enviar os arquivos ao Storage.');
    }
  };
})();
