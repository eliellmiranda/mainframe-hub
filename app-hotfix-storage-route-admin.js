(() => {
  'use strict';

  const HOTFIX_VERSION = '2026-04-06-storage-route-admin';
  const APP_KEY_PREFIX = 'mfhub.data.';
  const APP_KEY_SUFFIX = '.v4';
  const SESSION_KEY = 'mfhub.session.v4';
  const PRACTICE_ROUTE_KEY = 'mfhub.practice.route.v1';
  const DB_NAME = 'mfhub_hotfix_assets_v1';
  const STORE_NAME = 'files';
  const pendingAssetWrites = new Map();
  const knownAssetIdsByFileId = new Map();
  const hotfixState = {
    migratedFiles: 0,
    migratedBytes: 0,
    lastMigrationAt: '',
    lastCleanupAt: '',
    cleanupRemoved: 0,
  };

  if (window.__MFHUB_STORAGE_HOTFIX__) return;
  window.__MFHUB_STORAGE_HOTFIX__ = { version: HOTFIX_VERSION, state: hotfixState };

  const originalSetItem = Storage.prototype.setItem;

  function safeJsonParse(raw, fallback = null) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function uid(prefix = 'asset') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('pt-BR'); } catch { return '—'; }
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function isMfhubDataKey(key) {
    return typeof key === 'string' && key.startsWith(APP_KEY_PREFIX) && key.endsWith(APP_KEY_SUFFIX);
  }

  function getAllMfhubDataKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isMfhubDataKey(key)) keys.push(key);
    }
    return keys;
  }

  function getCurrentSessionUser() {
    const session = safeJsonParse(localStorage.getItem(SESSION_KEY), null);
    return session?.user || '';
  }

  function getCurrentDataKey() {
    const sessionUser = getCurrentSessionUser();
    if (sessionUser) return `${APP_KEY_PREFIX}${sessionUser}${APP_KEY_SUFFIX}`;
    return getAllMfhubDataKeys()[0] || '';
  }

  function getCurrentAppDataFromStorage() {
    const key = getCurrentDataKey();
    if (!key) return { key: '', data: null };
    return { key, data: safeJsonParse(localStorage.getItem(key), null) };
  }

  function visitObjects(value, visitor) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(item => visitObjects(item, visitor));
      return;
    }
    visitor(value);
    Object.values(value).forEach(child => visitObjects(child, visitor));
  }

  function dataUrlToBlob(dataUrl = '') {
    const [meta, data = ''] = String(dataUrl || '').split(',');
    const mimeMatch = /data:([^;]+);base64/i.exec(meta || '');
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bin = atob(data || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function estimateDataUrlBytes(dataUrl = '') {
    try {
      return dataUrlToBlob(dataUrl).size;
    } catch {
      return Math.max(0, Math.round(String(dataUrl || '').length * 0.75));
    }
  }

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB indisponível neste navegador.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir IndexedDB.'));
    });
    return dbPromise;
  }

  async function dbRequest(mode, executor) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let req;
      try {
        req = executor(store);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error || req?.error || new Error('Falha no IndexedDB.'));
      tx.onabort = () => reject(tx.error || req?.error || new Error('Falha no IndexedDB.'));
    });
  }

  async function saveAssetBlob(assetId, blob, meta = {}) {
    const record = {
      assetId,
      fileId: meta.fileId || '',
      user: getCurrentSessionUser(),
      name: meta.name || 'arquivo',
      type: meta.type || blob.type || 'application/octet-stream',
      sizeBytes: Number(meta.sizeBytes) || blob.size || 0,
      sourceKey: meta.sourceKey || '',
      createdAt: meta.createdAt || new Date().toISOString(),
      blob,
    };
    await dbRequest('readwrite', store => store.put(record));
    return record;
  }

  async function getAsset(assetId) {
    if (!assetId) return null;
    try {
      return await dbRequest('readonly', store => store.get(assetId));
    } catch {
      return null;
    }
  }

  async function deleteAsset(assetId) {
    if (!assetId) return;
    try {
      await dbRequest('readwrite', store => store.delete(assetId));
    } catch (err) {
      console.warn('[MFHUB HOTFIX] Falha ao remover asset:', err);
    }
  }

  async function getAssetStats() {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let count = 0;
        let totalBytes = 0;
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) {
            resolve({ count, totalBytes });
            return;
          }
          count += 1;
          totalBytes += Number(cursor.value?.sizeBytes) || Number(cursor.value?.blob?.size) || 0;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error || new Error('Falha ao ler assets.'));
      });
    } catch {
      return { count: 0, totalBytes: 0 };
    }
  }

  function registerPendingAsset(assetId, promise) {
    pendingAssetWrites.set(assetId, promise);
    promise.finally(() => {
      const current = pendingAssetWrites.get(assetId);
      if (current === promise) pendingAssetWrites.delete(assetId);
    });
  }

  async function waitForAsset(assetId) {
    const pending = pendingAssetWrites.get(assetId);
    if (pending) {
      try { await pending; } catch (err) { console.warn('[MFHUB HOTFIX] Asset pendente falhou:', err); }
    }
    return getAsset(assetId);
  }

  function scheduleAssetOffload(file, sourceKey) {
    if (!file || typeof file !== 'object') return false;
    if (file.assetId && !file.data) {
      if (file.id) knownAssetIdsByFileId.set(String(file.id), String(file.assetId));
      return false;
    }
    const rawData = typeof file.data === 'string' ? file.data : '';
    if (!/^data:/i.test(rawData)) return false;

    const fileId = String(file.id || uid('file'));
    const assetId = String(file.assetId || knownAssetIdsByFileId.get(fileId) || uid('asset'));
    const sizeBytes = Number(file.sizeBytes) || estimateDataUrlBytes(rawData);
    file.id = fileId;
    file.assetId = assetId;
    file.sizeBytes = sizeBytes;
    file.storage = 'indexeddb';
    knownAssetIdsByFileId.set(fileId, assetId);

    if (!pendingAssetWrites.has(assetId)) {
      const blob = dataUrlToBlob(rawData);
      const promise = saveAssetBlob(assetId, blob, {
        fileId,
        name: file.name || 'arquivo',
        type: file.type || blob.type,
        sizeBytes,
        sourceKey,
      }).then(() => {
        hotfixState.migratedFiles += 1;
        hotfixState.migratedBytes += sizeBytes;
        hotfixState.lastMigrationAt = new Date().toISOString();
      }).catch(err => {
        console.warn('[MFHUB HOTFIX] Falha ao migrar asset para IndexedDB:', err);
      });
      registerPendingAsset(assetId, promise);
    }

    delete file.data;
    return true;
  }

  function sanitizePayloadObject(payload, sourceKey = '') {
    if (!payload || typeof payload !== 'object') return { dirty: false };
    let dirty = false;
    visitObjects(payload, obj => {
      if (!Array.isArray(obj.attachments)) return;
      obj.attachments.forEach(file => {
        if (!file || typeof file !== 'object') return;
        const fileId = file.id ? String(file.id) : '';
        if (!file.assetId && fileId && knownAssetIdsByFileId.has(fileId)) {
          file.assetId = knownAssetIdsByFileId.get(fileId);
          file.storage = file.storage || 'indexeddb';
          dirty = true;
        }
        if (file.assetId && file.data) {
          delete file.data;
          file.storage = file.storage || 'indexeddb';
          dirty = true;
        }
        if (scheduleAssetOffload(file, sourceKey)) dirty = true;
      });
    });
    return { dirty };
  }

  async function migrateStoredPayloads() {
    const keys = getAllMfhubDataKeys();
    for (const key of keys) {
      const parsed = safeJsonParse(localStorage.getItem(key), null);
      if (!parsed || typeof parsed !== 'object') continue;
      const { dirty } = sanitizePayloadObject(parsed, key);
      if (dirty) {
        originalSetItem.call(localStorage, key, JSON.stringify(parsed));
      }
    }
  }

  function estimateLocalStorageUsageBytes() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      const value = localStorage.getItem(key) || '';
      total += (key.length + value.length) * 2;
    }
    return total;
  }

  async function getStorageOverview() {
    const { key, data } = getCurrentAppDataFromStorage();
    const appPayloadRaw = key ? (localStorage.getItem(key) || '') : '';
    const appPayloadBytes = appPayloadRaw.length * 2;
    const localBytes = estimateLocalStorageUsageBytes();
    let quota = 5 * 1024 * 1024;
    let usage = localBytes;
    let source = 'localStorage estimado';

    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate?.quota) quota = Number(estimate.quota) || quota;
        if (estimate?.usage) usage = Number(estimate.usage) || usage;
        source = 'navigator.storage.estimate()';
      } catch {
        // fallback silencioso
      }
    }

    let inlineAttachmentBytes = 0;
    let inlineAttachmentCount = 0;
    visitObjects(data, obj => {
      if (!Array.isArray(obj.attachments)) return;
      obj.attachments.forEach(file => {
        if (file?.data && /^data:/i.test(String(file.data))) {
          inlineAttachmentCount += 1;
          inlineAttachmentBytes += estimateDataUrlBytes(String(file.data));
        }
      });
    });

    const assetStats = await getAssetStats();
    return {
      source,
      quota,
      usage,
      free: Math.max(0, quota - usage),
      localBytes,
      appPayloadBytes,
      inlineAttachmentBytes,
      inlineAttachmentCount,
      indexedDbFiles: assetStats.count,
      indexedDbBytes: assetStats.totalBytes,
    };
  }

  function getPracticeRoute() {
    return safeJsonParse(localStorage.getItem(PRACTICE_ROUTE_KEY), null);
  }

  function setPracticeRoute(kind, spaceId = '', subId = '') {
    if (!kind || !spaceId) {
      localStorage.removeItem(PRACTICE_ROUTE_KEY);
      return;
    }
    originalSetItem.call(localStorage, PRACTICE_ROUTE_KEY, JSON.stringify({
      kind,
      spaceId,
      subId,
      savedAt: new Date().toISOString(),
      version: 1,
    }));
  }

  async function restorePracticeRouteIfNeeded() {
    const route = getPracticeRoute();
    if (!route || route.kind !== 'exercise' || !route.spaceId) return false;
    const { data } = getCurrentAppDataFromStorage();
    const lastSection = data?.meta?.lastSection || '';
    const hashSection = String(location.hash || '').replace(/^#/, '');
    if (lastSection !== 'exercises' && hashSection !== 'exercises') return false;
    if (typeof window.goSection !== 'function') return false;

    try {
      window.goSection('exercises', false);
      await sleep(80);
      if (route.subId && typeof window.openPracticeSubspace === 'function') {
        window.openPracticeSubspace('exercise', route.spaceId, route.subId);
        return true;
      }
      if (typeof window.openPracticeSpace === 'function') {
        window.openPracticeSpace('exercise', route.spaceId);
        return true;
      }
    } catch (err) {
      console.warn('[MFHUB HOTFIX] Falha ao restaurar rota de exercícios:', err);
    }
    return false;
  }

  function resolveAttachmentHolderFromData(data, type, id1, id2 = '', id3 = '') {
    if (!data || typeof data !== 'object') return null;
    if (type === 'doc') return (data.docs || []).find(d => d.id === id1) || null;
    if (type === 'manual') return (data.manuals || []).find(m => m.id === id1) || null;
    if (type === 'manual-node') {
      const manual = (data.manuals || []).find(m => m.id === id1);
      return (manual?.nodes || []).find(node => node.id === id2) || null;
    }
    if (type === 'course-module') {
      return (data.courses || []).find(c => c.id === id1)?.modules?.find(m => m.id === id2) || null;
    }
    if (type === 'course-submodule') {
      return (data.courses || []).find(c => c.id === id1)?.modules?.find(m => m.id === id3)?.submodules?.find(s => s.id === id2) || null;
    }
    if (type === 'code-subspace') {
      return (data.codeSpaces || []).find(s => s.id === id1)?.subspaces?.find(ss => ss.id === id2) || null;
    }
    if (type === 'exercise-subspace') {
      return (data.exerciseSpaces || []).find(s => s.id === id1)?.subspaces?.find(ss => ss.id === id2) || null;
    }
    if (type === 'interview-subspace') {
      return (data.interviewSpaces || []).find(s => s.id === id1)?.subspaces?.find(ss => ss.id === id2) || null;
    }
    return null;
  }

  function resolveAttachmentRecordFromStorage(type, id1, id2, fileId, id3 = '') {
    const { data } = getCurrentAppDataFromStorage();
    const holder = resolveAttachmentHolderFromData(data, type, id1, id2, id3);
    const file = holder?.attachments?.find(item => item.id === fileId) || null;
    return { holder, file };
  }

  function blobToObjectUrl(blob) {
    return URL.createObjectURL(blob);
  }

  async function openAssetBlob(asset, download = false) {
    if (!asset?.blob) return false;
    const url = blobToObjectUrl(asset.blob);
    const a = document.createElement('a');
    a.href = url;
    if (download) {
      a.download = asset.name || 'arquivo';
    } else {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  async function cleanupOrphanedAssets() {
    const referenced = new Set();
    const keys = getAllMfhubDataKeys();
    keys.forEach(key => {
      const parsed = safeJsonParse(localStorage.getItem(key), null);
      visitObjects(parsed, obj => {
        if (!Array.isArray(obj.attachments)) return;
        obj.attachments.forEach(file => {
          if (file?.assetId) referenced.add(String(file.assetId));
        });
      });
    });

    try {
      const db = await openDb();
      let removed = 0;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        req.onsuccess = event => {
          const cursor = event.target.result;
          if (!cursor) return;
          const assetId = String(cursor.value?.assetId || '');
          if (assetId && !referenced.has(assetId)) {
            removed += 1;
            cursor.delete();
          }
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Falha ao limpar órfãos.'));
        tx.onabort = () => reject(tx.error || new Error('Falha ao limpar órfãos.'));
      });
      hotfixState.cleanupRemoved += removed;
      hotfixState.lastCleanupAt = new Date().toISOString();
    } catch (err) {
      console.warn('[MFHUB HOTFIX] Falha ao limpar assets órfãos:', err);
    }
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    try {
      if (this === localStorage && isMfhubDataKey(key) && typeof value === 'string') {
        const parsed = safeJsonParse(value, null);
        if (parsed && typeof parsed === 'object') {
          sanitizePayloadObject(parsed, key);
          value = JSON.stringify(parsed);
        }
      }
    } catch (err) {
      console.warn('[MFHUB HOTFIX] Sanitização de localStorage falhou:', err);
    }
    return originalSetItem.call(this, key, value);
  };

  function patchPracticeNavigation() {
    if (typeof window.openPracticeSpace === 'function' && !window.openPracticeSpace.__mfhubHotfixWrapped) {
      const original = window.openPracticeSpace;
      const wrapped = function patchedOpenPracticeSpace(kind, id) {
        if (kind === 'exercise') setPracticeRoute('exercise', id, '');
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.openPracticeSpace = wrapped;
    }

    if (typeof window.openPracticeSubspace === 'function' && !window.openPracticeSubspace.__mfhubHotfixWrapped) {
      const original = window.openPracticeSubspace;
      const wrapped = function patchedOpenPracticeSubspace(kind, spaceId, subId) {
        if (kind === 'exercise') setPracticeRoute('exercise', spaceId, subId || '');
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.openPracticeSubspace = wrapped;
    }

    if (typeof window.backToPracticeList === 'function' && !window.backToPracticeList.__mfhubHotfixWrapped) {
      const original = window.backToPracticeList;
      const wrapped = function patchedBackToPracticeList(kind) {
        if (kind === 'exercise') localStorage.removeItem(PRACTICE_ROUTE_KEY);
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.backToPracticeList = wrapped;
    }

    if (typeof window.backToPracticeSpace === 'function' && !window.backToPracticeSpace.__mfhubHotfixWrapped) {
      const original = window.backToPracticeSpace;
      const wrapped = function patchedBackToPracticeSpace(kind) {
        const route = getPracticeRoute();
        if (kind === 'exercise' && route?.spaceId) setPracticeRoute('exercise', route.spaceId, '');
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.backToPracticeSpace = wrapped;
    }
  }

  function patchAttachmentActions() {
    if (typeof window.openAttachment === 'function' && !window.openAttachment.__mfhubHotfixWrapped) {
      const original = window.openAttachment;
      const wrapped = async function patchedOpenAttachment(type, id1, id2, fileId, id3 = '') {
        const { file } = resolveAttachmentRecordFromStorage(type, id1, id2, fileId, id3);
        if (file?.assetId) {
          const asset = await waitForAsset(String(file.assetId));
          if (asset?.blob) return openAssetBlob(asset, false);
        }
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.openAttachment = wrapped;
    }

    if (typeof window.downloadAttachment === 'function' && !window.downloadAttachment.__mfhubHotfixWrapped) {
      const original = window.downloadAttachment;
      const wrapped = async function patchedDownloadAttachment(type, id1, id2, fileId, id3 = '') {
        const { file } = resolveAttachmentRecordFromStorage(type, id1, id2, fileId, id3);
        if (file?.assetId) {
          const asset = await waitForAsset(String(file.assetId));
          if (asset?.blob) return openAssetBlob(asset, true);
        }
        return original.apply(this, arguments);
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.downloadAttachment = wrapped;
    }

    if (typeof window.removeAttachment === 'function' && !window.removeAttachment.__mfhubHotfixWrapped) {
      const original = window.removeAttachment;
      const wrapped = function patchedRemoveAttachment() {
        const result = original.apply(this, arguments);
        setTimeout(() => { cleanupOrphanedAssets(); }, 700);
        return result;
      };
      wrapped.__mfhubHotfixWrapped = true;
      window.removeAttachment = wrapped;
    }
  }

  function buildAdminPanelHtml(stats) {
    return `
      <div class="panel" id="mfhub-hotfix-admin-panel">
        <div class="panel-title">Armazenamento do navegador (estimado)</div>
        <div class="stat-row"><span class="sk">Fonte</span><span class="sv">${escapeHtml(stats.source)}</span></div>
        <div class="stat-row"><span class="sk">Quota total</span><span class="sv">${escapeHtml(formatBytes(stats.quota))}</span></div>
        <div class="stat-row"><span class="sk">Uso total</span><span class="sv">${escapeHtml(formatBytes(stats.usage))}</span></div>
        <div class="stat-row"><span class="sk">Livre</span><span class="sv">${escapeHtml(formatBytes(stats.free))}</span></div>
        <div class="stat-row"><span class="sk">Payload MFHUB</span><span class="sv">${escapeHtml(formatBytes(stats.appPayloadBytes))}</span></div>
        <div class="stat-row"><span class="sk">localStorage</span><span class="sv">${escapeHtml(formatBytes(stats.localBytes))}</span></div>
        <div class="stat-row"><span class="sk">Assets em IndexedDB</span><span class="sv">${escapeHtml(String(stats.indexedDbFiles))} arquivo(s) · ${escapeHtml(formatBytes(stats.indexedDbBytes))}</span></div>
        <div class="stat-row"><span class="sk">Inline restante</span><span class="sv">${escapeHtml(String(stats.inlineAttachmentCount))} arquivo(s) · ${escapeHtml(formatBytes(stats.inlineAttachmentBytes))}</span></div>
        <div class="stat-row"><span class="sk">Migrado pelo hotfix</span><span class="sv">${escapeHtml(String(hotfixState.migratedFiles))} arquivo(s) · ${escapeHtml(formatBytes(hotfixState.migratedBytes))}</span></div>
        <div class="stat-row"><span class="sk">Última migração</span><span class="sv">${escapeHtml(formatDate(hotfixState.lastMigrationAt))}</span></div>
        <div class="stat-row"><span class="sk">Última limpeza</span><span class="sv">${escapeHtml(formatDate(hotfixState.lastCleanupAt))}</span></div>
      </div>
    `;
  }

  function patchAdminModal() {
    if (typeof window.openAdminModeModal !== 'function' || window.openAdminModeModal.__mfhubHotfixWrapped) return;
    const original = window.openAdminModeModal;
    const wrapped = function patchedOpenAdminModeModal() {
      const result = original.apply(this, arguments);
      setTimeout(async () => {
        const body = document.getElementById('modal-body');
        if (!body || body.querySelector('#mfhub-hotfix-admin-panel')) return;
        try {
          const stats = await getStorageOverview();
          body.insertAdjacentHTML('beforeend', buildAdminPanelHtml(stats));
        } catch (err) {
          console.warn('[MFHUB HOTFIX] Falha ao injetar painel admin:', err);
        }
      }, 0);
      return result;
    };
    wrapped.__mfhubHotfixWrapped = true;
    window.openAdminModeModal = wrapped;
  }

  async function initializeHotfix() {
    try {
      await migrateStoredPayloads();
      await cleanupOrphanedAssets();
    } catch (err) {
      console.warn('[MFHUB HOTFIX] Inicialização de storage falhou:', err);
    }

    for (let i = 0; i < 60; i += 1) {
      patchPracticeNavigation();
      patchAttachmentActions();
      patchAdminModal();
      if (typeof window.goSection === 'function' && typeof window.openPracticeSpace === 'function' && typeof window.openAdminModeModal === 'function') break;
      await sleep(100);
    }

    setTimeout(() => { restorePracticeRouteIfNeeded(); }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initializeHotfix(); }, { once: true });
  } else {
    initializeHotfix();
  }
})();
