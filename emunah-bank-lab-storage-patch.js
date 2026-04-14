(() => {
  'use strict';

  const PATCH_VERSION = '2026-04-13-storage-supabase-ebl';
  if (window.__EBL_STORAGE_SUPABASE_PATCH__) return;
  window.__EBL_STORAGE_SUPABASE_PATCH__ = { version: PATCH_VERSION };

  const STORAGE_FUNCTION_URL = `${String(window.MFHUB_SUPABASE_URL || '').trim()}/functions/v1/site-storage`;
  const signedUrlCache = new Map();

  function isRemotePath(value) {
    return typeof value === 'string' && value.includes('/') && !/^data:/i.test(value);
  }

  function dataUrlToBlobLocal(dataUrl = '') {
    const [meta, data = ''] = String(dataUrl || '').split(',');
    const mimeMatch = /data:([^;]+);base64/i.exec(meta || '');
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bin = atob(data || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function fileFromBlob(blob, name = 'arquivo.bin', type = '') {
    try {
      return new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
    } catch {
      blob.name = name;
      blob.lastModified = Date.now();
      blob.type = type || blob.type || 'application/octet-stream';
      return blob;
    }
  }

  function canUseRemoteStorage() {
    return !!(SUPABASE_ENABLED && STORAGE_FUNCTION_URL && CTOKEN);
  }

  async function storageJson(action, payload = {}) {
    const res = await fetch(STORAGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ebl-token': String(CTOKEN || '')
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

  async function storageUpload(file, category = 'diary', oldPath = '') {
    const form = new FormData();
    form.set('action', 'upload');
    form.set('category', category);
    if (oldPath) form.set('oldPath', oldPath);
    form.set('file', file, file.name || 'arquivo');
    const res = await fetch(STORAGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'x-ebl-token': String(CTOKEN || '') },
      body: form
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || text || 'Falha ao enviar arquivo ao Storage.');
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

  const originalSaveDiaryAsset = saveDiaryAsset;
  saveDiaryAsset = async function patchedSaveDiaryAsset(fileOrBlob, meta = {}) {
    if (!canUseRemoteStorage()) return originalSaveDiaryAsset(fileOrBlob, meta);
    const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob], { type: meta.type || 'application/octet-stream' });
    const upload = await storageUpload(fileFromBlob(blob, meta.name || 'arquivo', meta.type || blob.type), 'diary', isRemotePath(meta.assetId) ? meta.assetId : '');
    return upload.path || '';
  };

  const originalDeleteDiaryAsset = deleteDiaryAsset;
  deleteDiaryAsset = async function patchedDeleteDiaryAsset(assetId = '') {
    if (isRemotePath(assetId) && canUseRemoteStorage()) {
      await storageJson('delete', { path: assetId });
      signedUrlCache.delete(assetId);
      return true;
    }
    return originalDeleteDiaryAsset(assetId);
  };

  const originalGetDiaryFileBlob = getDiaryFileBlob;
  getDiaryFileBlob = async function patchedGetDiaryFileBlob(file) {
    if (!file) return null;
    if (isRemotePath(file.assetId) && canUseRemoteStorage()) {
      const url = await signPath(file.assetId, file.name || 'arquivo');
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao baixar o anexo do Storage.');
      return await res.blob();
    }
    return originalGetDiaryFileBlob(file);
  };

  const originalMigrateDiaryFiles = migrateDiaryFilesToIndexedDb;
  migrateDiaryFilesToIndexedDb = async function patchedMigrateDiaryFiles(targetDiary = DIARY) {
    if (!canUseRemoteStorage()) return originalMigrateDiaryFiles(targetDiary);
    let changed = false;
    for (const entry of targetDiary || []) {
      entry.files = Array.isArray(entry.files) ? entry.files : [];
      for (const file of entry.files) {
        if (!file || typeof file !== 'object') continue;
        if (file.assetId && isRemotePath(file.assetId)) {
          if (file.data) {
            delete file.data;
            changed = true;
          }
          continue;
        }
        let blob = null;
        if (file.data && /^data:/i.test(String(file.data))) {
          blob = dataUrlToBlobLocal(file.data);
        } else if (file.assetId) {
          const localAsset = await getDiaryAsset(file.assetId);
          if (localAsset?.blob) blob = localAsset.blob;
        }
        if (!blob) continue;
        const upload = await storageUpload(fileFromBlob(blob, file.name || 'arquivo', file.type || blob.type), 'diary');
        if (file.assetId && !isRemotePath(file.assetId)) {
          try { await originalDeleteDiaryAsset(file.assetId); } catch {}
        }
        file.assetId = upload.path || '';
        file.size = Number(file.size || blob.size || 0);
        file.type = file.type || blob.type || 'application/octet-stream';
        delete file.data;
        changed = true;
      }
    }
    return changed;
  };

  downloadAttachment = async function patchedDownloadAttachment(assetId, name) {
    try {
      if (isRemotePath(assetId) && canUseRemoteStorage()) {
        const url = await signPath(assetId, name || 'arquivo');
        if (!url) throw new Error('Arquivo não encontrado.');
        const a = document.createElement('a');
        a.href = url;
        a.download = name || 'arquivo';
        a.click();
        return;
      }
      const item = await getDiaryAsset(assetId);
      if (!item?.blob) throw new Error('Arquivo não encontrado.');
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'arquivo';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      alert(String(err?.message || 'Arquivo não encontrado.'));
    }
  };
})();
