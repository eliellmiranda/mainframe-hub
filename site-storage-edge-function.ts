import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const BUCKET = 'site-assets';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ebl-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function badRequest(message: string) {
  return json(400, { ok: false, error: message });
}

function assertEnv() {
  if (!SUPABASE_URL) throw new Error('missing_supabase_url');
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('missing_service_role_key');
}

assertEnv();

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeSegment(value: string) {
  return (
    String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'file'
  );
}

function buildPath(app: string, userKey: string, category: string, fileName: string) {
  const safeName = safeSegment(fileName.replace(/\.[^.]+$/, ''));
  const ext =
    (fileName.split('.').pop() || 'bin')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 12) || 'bin';
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const ts = new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  return `${app}/${safeSegment(userKey)}/${safeSegment(category)}/${ts}-${rand}-${safeName}.${ext.toLowerCase()}`;
}

async function sha256Hex(input: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash))
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveActor(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data?.user?.id) {
      return {
        app: 'mfhub',
        userKey: data.user.id,
        owner: data.user.email || data.user.id,
        mode: 'supabase-auth',
      };
    }
  }

  const eblToken = (req.headers.get('x-ebl-token') || '').trim();
  if (eblToken) {
    const tokenHash = await sha256Hex(eblToken);
    const { data, error } = await admin
      .from('emunah_lab_sessions')
      .select('username, expires_at')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!error && data?.username) {
      return {
        app: 'ebl',
        userKey: String(data.username).toUpperCase(),
        owner: String(data.username).toUpperCase(),
        mode: 'emunah-lab-session',
      };
    }
  }

  throw new Error('unauthorized');
}

function assertOwnedPath(actor: { app: string; userKey: string }, path: string) {
  const prefix = `${actor.app}/${safeSegment(actor.userKey)}/`;
  if (!String(path || '').startsWith(prefix)) {
    throw new Error('forbidden_path');
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return badRequest('Método inválido.');
  }

  try {
    const actor = await resolveActor(req);
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const action = String(form.get('action') || '').trim();

      if (action !== 'upload') {
        return badRequest('Ação de upload inválida.');
      }

      const category = safeSegment(String(form.get('category') || 'attachment'));
      const oldPath = String(form.get('oldPath') || '').trim();
      const file = form.get('file');

      if (!(file instanceof File)) {
        return badRequest('Arquivo ausente no upload.');
      }

      const path = buildPath(actor.app, actor.userKey, category, file.name || 'arquivo.bin');
      const buffer = await file.arrayBuffer();

      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

      if (uploadError) throw uploadError;

      if (oldPath) {
        try {
          assertOwnedPath(actor, oldPath);
          await admin.storage.from(BUCKET).remove([oldPath]);
        } catch {
          // ignora remoção inválida do arquivo antigo
        }
      }

      const { data: signed, error: signedError } = await admin
        .storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60);

      if (signedError) throw signedError;

      return json(200, {
        ok: true,
        app: actor.app,
        owner: actor.owner,
        bucket: BUCKET,
        path,
        name: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        signedUrl: signed?.signedUrl || '',
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const path = String(body?.path || '').trim();
    const downloadName = String(body?.downloadName || '').trim();

    if (!action) {
      return badRequest('Ação obrigatória.');
    }

    if ((action === 'sign' || action === 'delete') && !path) {
      return badRequest('Caminho obrigatório.');
    }

    if (action === 'sign') {
      assertOwnedPath(actor, path);
      const { data, error } = await admin
        .storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60, downloadName ? { download: downloadName } : undefined);

      if (error) throw error;

      return json(200, {
        ok: true,
        url: data?.signedUrl || '',
        path,
        bucket: BUCKET,
      });
    }

    if (action === 'delete') {
      assertOwnedPath(actor, path);
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw error;

      return json(200, {
        ok: true,
        deleted: true,
        path,
        bucket: BUCKET,
      });
    }

    return badRequest('Ação inválida.');
  } catch (error) {
    const msg = String(error instanceof Error ? error.message : error || 'Erro interno');

    if (msg === 'missing_supabase_url') {
      return json(500, { ok: false, error: 'SUPABASE_URL ausente no ambiente da Edge Function.' });
    }

    if (msg === 'missing_service_role_key') {
      return json(500, { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY ausente no ambiente da Edge Function.' });
    }

    if (msg === 'unauthorized') {
      return json(401, { ok: false, error: 'Sessão inválida ou ausente para o Storage.' });
    }

    if (msg === 'forbidden_path') {
      return json(403, { ok: false, error: 'Você não pode acessar esse arquivo.' });
    }

    console.error('[site-storage]', error);
    return json(500, { ok: false, error: msg || 'Falha interna no Storage.' });
  }
});
