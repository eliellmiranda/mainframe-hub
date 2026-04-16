(() => {
  'use strict';

  const PATCH_VERSION = '2026-04-13-storage-supabase-mfhub';
  if (window.__MFHUB_STORAGE_SUPABASE_PATCH__) return;
  window.__MFHUB_STORAGE_SUPABASE_PATCH__ = { version: PATCH_VERSION };

  const STORAGE_FUNCTION_URL = `${String(window.MFHUB_SUPABASE_URL || '').trim()}/functions/v1/site-storage`;
  const signedUrlCache = new Map();
  let legacyMigrationPromise = null;

  function isReady() {
    return !!(window.supabase && window.MFHUB_SUPABASE_URL && window.MFHUB_SUPABASE_ANON_KEY);
  }

  function isStoragePath(value) {
    return typeof value === 'string' && value.includes('/') && !/^data:/i.test(value);
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

  function dataUrlToBlob(dataUrl = '') {
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

  async function getAccessToken() {
    if (!isReady() || typeof supabaseClient === 'undefined' || !supabaseClient?.auth?.getSession) {
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
    if (cached && cached.url && cached.expiresAt > Date.now()) return cached.url;
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

  function ensureProfileShape() {
    appData.profile ||= { photoData:'', photoName:'', photoPosition:'center center' };
    if (typeof appData.profile.photoPath !== 'string') appData.profile.photoPath = '';
    if (typeof appData.profile.photoName !== 'string') appData.profile.photoName = '';
    if (typeof appData.profile.photoPosition !== 'string') appData.profile.photoPosition = 'center center';
  }

  function getProfilePhotoPreviewSync() {
    ensureProfileShape();
    const path = String(appData?.profile?.photoPath || '');
    if (path) {
      const cached = signedUrlCache.get(path);
      if (cached?.url && cached.expiresAt > Date.now()) return cached.url;
    }
    return String(appData?.profile?.photoData || '');
  }

  async function getProfilePhotoPreview(force = false) {
    ensureProfileShape();
    const path = String(appData?.profile?.photoPath || '');
    if (!path) return String(appData?.profile?.photoData || '');
    if (!force) {
      const cached = signedUrlCache.get(path);
      if (cached?.url && cached.expiresAt > Date.now()) return cached.url;
    }
    try {
      return await signPath(path);
    } catch (err) {
      console.warn('[MFHUB storage patch] Falha ao assinar foto de perfil:', err);
      return String(appData?.profile?.photoData || '');
    }
  }

  function collectAttachmentHolders() {
    const holders = [];
    const pushHolder = holder => {
      if (!holder || typeof holder !== 'object') return;
      holder.attachments ||= [];
      holders.push(holder);
    };

    (appData.docs || []).forEach(pushHolder);
    (appData.manuals || []).forEach(manual => {
      if (!manual) return;
      manual.attachments ||= [];
      pushHolder(manual);
      if (typeof ensureManualStructure === 'function') ensureManualStructure(manual);
      (manual.nodes || []).forEach(pushHolder);
    });
    (appData.courses || []).forEach(course => {
      (course.modules || []).forEach(module => {
        pushHolder(module);
        (module.submodules || []).forEach(pushHolder);
      });
    });
    (appData.codeSpaces || []).forEach(space => {
      pushHolder(space);
      (space.subspaces || []).forEach(pushHolder);
    });
    (appData.exerciseSpaces || []).forEach(space => {
      pushHolder(space);
      (space.subspaces || []).forEach(pushHolder);
    });
    (appData.interviewSpaces || []).forEach(space => {
      pushHolder(space);
      (space.subspaces || []).forEach(pushHolder);
    });
    return holders;
  }

  async function migrateLegacyBrowserAssets() {
    if (legacyMigrationPromise) return legacyMigrationPromise;
    legacyMigrationPromise = (async () => {
      if (!canUseCloudSync || !canUseCloudSync() || !appData) return false;
      let changed = false;

      ensureProfileShape();
      if (appData.profile.photoData && !appData.profile.photoPath) {
        try {
          const blob = dataUrlToBlob(appData.profile.photoData);
          const uploaded = await storageUpload(fileFromBlob(blob, appData.profile.photoName || 'perfil.jpg', blob.type), 'profile-photo');
          appData.profile.photoPath = uploaded.path || '';
          appData.profile.photoName = uploaded.name || appData.profile.photoName || 'perfil.jpg';
          appData.profile.photoData = '';
          changed = true;
        } catch (err) {
          console.warn('[MFHUB storage patch] Falha ao migrar foto legada:', err);
        }
      }

      for (const holder of collectAttachmentHolders()) {
        for (const file of holder.attachments || []) {
          if (!file || typeof file !== 'object') continue;
          if (file.storagePath && file.data) {
            delete file.data;
            changed = true;
            continue;
          }
          if (!file.storagePath && typeof file.data === 'string' && /^data:/i.test(file.data)) {
            try {
              const blob = dataUrlToBlob(file.data);
              const uploaded = await storageUpload(fileFromBlob(blob, file.name || 'arquivo', file.type || blob.type), 'attachment');
              file.storagePath = uploaded.path || '';
              file.size = Number(file.size || blob.size || 0);
              file.type = file.type || blob.type || 'application/octet-stream';
              delete file.data;
              changed = true;
            } catch (err) {
              console.warn('[MFHUB storage patch] Falha ao migrar anexo legado:', file?.name, err);
            }
          }
        }
      }

      if (changed) {
        saveUserData({ reason:'Migrou assets legados para Storage' });
        renderAll();
      }
      return changed;
    })().finally(() => { legacyMigrationPromise = null; });
    return legacyMigrationPromise;
  }

  const originalEnsureDefaults = ensureDefaults;
  ensureDefaults = function patchedEnsureDefaults() {
    originalEnsureDefaults.apply(this, arguments);
    ensureProfileShape();
  };

  const originalResolveAttachmentHolder = resolveAttachmentHolder;
  resolveAttachmentHolder = function patchedResolveAttachmentHolder(type, id1, id2 = '', id3 = '') {
    if (type === 'manual-node') {
      const manual = (appData.manuals || []).find(m => m.id === id1);
      if (!manual) return null;
      if (typeof ensureManualStructure === 'function') ensureManualStructure(manual);
      return (manual.nodes || []).find(node => node.id === id2) || null;
    }
    return originalResolveAttachmentHolder(type, id1, id2, id3);
  };

  payloadHasUserContent = function patchedPayloadHasUserContent(payload) {
    const p = Object.assign(baseData(), payload || {});
    return Boolean(
      (p.courses || []).length ||
      (p.docs || []).length ||
      (p.codeSpaces || []).length ||
      (p.exerciseSpaces || []).length ||
      (p.interviewSpaces || []).length ||
      (p.linkedinPosts || []).length ||
      (p.certificates || []).length ||
      (p.generalNotes || []).length ||
      (p.tools || []).length ||
      (p.reminders || []).length ||
      Object.values(p.dailyGoals || {}).some(list => Array.isArray(list) && list.length) ||
      p.profile?.photoPath ||
      p.profile?.photoData ||
      (p.lab?.url)
    );
  };

  const originalRenderSidebarIdentity = renderSidebarIdentity;
  renderSidebarIdentity = function patchedRenderSidebarIdentity() {
    originalRenderSidebarIdentity.apply(this, arguments);
    const avatarImg = document.getElementById('profile-avatar-image');
    const avatarFallback = document.getElementById('profile-avatar-fallback');
    const position = String(appData?.profile?.photoPosition || 'center center');
    if (avatarImg) avatarImg.style.objectPosition = position;
    getProfilePhotoPreview().then(src => {
      if (!avatarImg) return;
      if (src) {
        avatarImg.src = src;
        avatarImg.hidden = false;
        if (avatarFallback) avatarFallback.style.display = 'none';
      } else {
        avatarImg.removeAttribute('src');
        avatarImg.hidden = true;
        if (avatarFallback) avatarFallback.style.display = 'block';
      }
    }).catch(() => {});
  };

  openAttachment = async function patchedOpenAttachment(type, id1, id2, fileId, id3 = '') {
    const { file } = getAttachmentRecord(type, id1, id2, fileId, id3);
    if (!file) return showToast('Arquivo não encontrado.');
    try {
      let href = '';
      if (file.storagePath) href = await signPath(file.storagePath, file.name || 'arquivo');
      else if (file.data) href = file.data;
      if (!href) return showToast('Arquivo não encontrado.');
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível abrir o arquivo.');
    }
  };

  downloadAttachment = async function patchedDownloadAttachment(type, id1, id2, fileId, id3 = '') {
    const { file } = getAttachmentRecord(type, id1, id2, fileId, id3);
    if (!file) return showToast('Arquivo não encontrado.');
    try {
      let href = '';
      if (file.storagePath) href = await signPath(file.storagePath, file.name || 'arquivo');
      else if (file.data) href = file.data;
      if (!href) return showToast('Arquivo não encontrado.');
      const a = document.createElement('a');
      a.href = href;
      a.download = file.name || 'arquivo';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível baixar o arquivo.');
    }
  };

  removeAttachment = async function patchedRemoveAttachment(type, id1, id2, fileId, id3 = '') {
    const { holder, file } = getAttachmentRecord(type, id1, id2, fileId, id3);
    if (!holder || !file) return showToast('Arquivo não encontrado.');
    if (!confirm(`Excluir o arquivo "${file.name}"?`)) return;
    try {
      if (file.storagePath) await deletePath(file.storagePath);
      holder.attachments = (holder.attachments || []).filter(item => item.id !== fileId);
      saveUserData({ reason:'Removeu anexo do Storage' });
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
      saveUserData({ reason:'Anexou arquivos ao Storage' });
      closeModal();
      renderAll();
      showToast('Arquivos anexados ao Storage.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Falha ao enviar os arquivos ao Storage.');
    }
  };

  clearProfilePhoto = async function patchedClearProfilePhoto() {
    try {
      ensureProfileShape();
      const path = String(appData.profile.photoPath || '');
      if (path) await deletePath(path);
      appData.profile.photoPath = '';
      appData.profile.photoData = '';
      appData.profile.photoName = '';
      appData.profile.photoPosition ||= 'center center';
      saveUserData({ reason:'Removeu foto de perfil do Storage' });
      renderSidebarIdentity();
      closeModal();
      showToast('Foto de perfil removida.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível remover a foto.');
    }
  };

  saveProfilePhoto = async function patchedSaveProfilePhoto() {
    const file = document.getElementById('profile-photo-file')?.files?.[0];
    if (!file) return showToast('Escolha uma imagem primeiro.');
    try {
      const processed = await processProfilePhotoFile(file);
      const blob = processed?.blob || dataUrlToBlob(processed.dataUrl || '');
      const uploaded = await storageUpload(fileFromBlob(blob, processed.fileName || 'perfil.jpg', blob.type || 'image/jpeg'), 'profile-photo', String(appData?.profile?.photoPath || ''));
      ensureProfileShape();
      appData.profile.photoPath = uploaded.path || '';
      appData.profile.photoData = '';
      appData.profile.photoName = processed.fileName || 'perfil.jpg';
      saveUserData({ reason:'Atualizou foto de perfil no Storage' });
      renderSidebarIdentity();
      closeModal();
      showToast('Foto de perfil atualizada.');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Não foi possível salvar a foto.');
    }
  };

  if (typeof processProfilePhotoFile === 'function') {
    const originalProcessProfilePhotoFile = processProfilePhotoFile;
    processProfilePhotoFile = function patchedProcessProfilePhotoFile(file) {
      return Promise.resolve(originalProcessProfilePhotoFile(file)).then(result => {
        const blob = result?.blob || dataUrlToBlob(result?.dataUrl || '');
        return { ...result, blob };
      });
    };
  }

  if (typeof openProfileModal === 'function') {
    openProfileModal = async function patchedOpenProfileModal() {
      appData.profile ||= advClone(ADV_PROFILE_DEFAULTS);
      const profile = Object.assign({}, ADV_PROFILE_DEFAULTS, appData.profile || {});
      const preview = await getProfilePhotoPreview();
      const favoriteOptions = [
        ['dashboard','Dashboard'], ['goals','Metas'], ['manuals','Manuais'], ['tools','Ferramentas'], ['lab','Lab'], ['courses','Cursos']
      ];
      openModal('Perfil do usuário', `
        <div class="cols-2">
          <div class="panel">
            <div class="panel-title">Identidade</div>
            <div class="row"><label class="lbl">Foto</label><input id="profile-photo-file" class="input" type="file" accept="image/*"></div>
            ${preview ? `<div class="row"><img src="${escapeHtml(preview)}" alt="Prévia" style="width:96px;height:96px;border-radius:50%;object-fit:cover;object-position:${escapeHtml(profile.photoPosition || 'center center')};border:1px solid var(--border)"></div>` : ''}
            <div class="row"><label class="lbl">Posição da foto</label><select id="profile-photo-position" class="select">
              <option value="center center" ${(profile.photoPosition || 'center center') === 'center center' ? 'selected' : ''}>Centralizada</option>
              <option value="center top" ${profile.photoPosition === 'center top' ? 'selected' : ''}>Mais acima</option>
              <option value="center 35%" ${profile.photoPosition === 'center 35%' ? 'selected' : ''}>Rosto mais visível</option>
              <option value="center bottom" ${profile.photoPosition === 'center bottom' ? 'selected' : ''}>Mais abaixo</option>
            </select></div>
            <div class="auth-note">A foto é redimensionada automaticamente antes do upload para o Supabase Storage.</div>
            <div class="row"><label class="lbl">Nome de exibição</label><input id="profile-display-name" class="input" value="${escapeHtml(profile.displayName)}" placeholder="Ex.: Eliel Miranda"></div>
            <div class="row"><label class="lbl">Título</label><input id="profile-tagline" class="input" value="${escapeHtml(profile.tagline)}" placeholder="Ex.: Analista Mainframe"></div>
            <div class="row"><label class="lbl">Local</label><input id="profile-location" class="input" value="${escapeHtml(profile.location)}" placeholder="Cidade / contexto"></div>
          </div>
          <div class="panel">
            <div class="panel-title">Resumo</div>
            <div class="row"><label class="lbl">Bio curta</label><textarea id="profile-bio" class="textarea">${escapeHtml(profile.bio)}</textarea></div>
            <div class="row"><label class="lbl">Links</label><textarea id="profile-links" class="textarea" placeholder="Um por linha">${escapeHtml(profile.links)}</textarea></div>
            <div class="row"><label class="lbl">Atalhos favoritos</label>
              <div class="profile-fav-grid">
                ${favoriteOptions.map(([value,label]) => `<label><input type="checkbox" data-profile-fav value="${value}" ${profile.favorites.includes(value) ? 'checked' : ''}> ${label}</label>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `, `<button class="btn" onclick="openAdminModeModal()">Admin técnico</button><button class="btn" onclick="clearProfilePhoto()">Remover foto</button><button class="btn primary" onclick="saveProfileModal()">Salvar perfil</button>`);
    };
    openProfilePhotoModal = openProfileModal;
  }

  if (typeof saveProfileModal === 'function') {
    saveProfileModal = async function patchedSaveProfileModal() {
      const file = document.getElementById('profile-photo-file')?.files?.[0] || null;
      const applyFields = (photoPath = '', photoName = '') => {
        appData.profile ||= advClone(ADV_PROFILE_DEFAULTS);
        appData.profile.displayName = document.getElementById('profile-display-name')?.value.trim() || '';
        appData.profile.tagline = document.getElementById('profile-tagline')?.value.trim() || '';
        appData.profile.location = document.getElementById('profile-location')?.value.trim() || '';
        appData.profile.bio = document.getElementById('profile-bio')?.value.trim() || '';
        appData.profile.links = document.getElementById('profile-links')?.value.trim() || '';
        appData.profile.photoPosition = document.getElementById('profile-photo-position')?.value || 'center center';
        appData.profile.favorites = Array.from(document.querySelectorAll('[data-profile-fav]:checked')).map(el => el.value);
        if (photoPath) {
          appData.profile.photoPath = photoPath;
          appData.profile.photoName = photoName || 'perfil.jpg';
          appData.profile.photoData = '';
        }
        saveUserData({ reason:'Atualizou perfil' });
        renderSidebarIdentity();
        closeModal();
        showToast('Perfil atualizado.');
      };
      if (!file) return applyFields();
      try {
        const processed = await processProfilePhotoFile(file);
        const blob = processed?.blob || dataUrlToBlob(processed?.dataUrl || '');
        const uploaded = await storageUpload(fileFromBlob(blob, processed.fileName || 'perfil.jpg', blob.type || 'image/jpeg'), 'profile-photo', String(appData?.profile?.photoPath || ''));
        applyFields(uploaded.path || '', processed.fileName || 'perfil.jpg');
      } catch (err) {
        console.error(err);
        showToast(err?.message || 'Não foi possível salvar a foto.');
      }
    };
  }

  if (typeof bootstrapCloudState === 'function') {
    const originalBootstrapCloudState = bootstrapCloudState;
    bootstrapCloudState = async function patchedBootstrapCloudState() {
      const result = await originalBootstrapCloudState.apply(this, arguments);
      try { await migrateLegacyBrowserAssets(); } catch (err) { console.warn('[MFHUB storage patch] Migração legada falhou:', err); }
      return result;
    };
  }
})();
