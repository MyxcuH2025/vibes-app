/**
 * Supabase Edge Function: r2-delete
 *
 * Best-effort cleanup for Cloudflare R2 objects after the owning post was
 * deleted from the database.
 *
 * Required secrets:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME
 * - R2_PUBLIC_URL
 * - R2_CLEANUP_SECRET (optional; enables admin cleanup with x-cleanup-secret)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DeleteRequest = {
  keys?: string[];
  urls?: string[];
  processQueue?: boolean;
  selfTest?: boolean;
  limit?: number;
};

type QueueRow = {
  id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  attempts: number;
};

const ALLOWED_ROOTS = new Set(['posts', 'thumbnails', 'avatars']);

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function hmac(key: ArrayBuffer | Uint8Array | string, data: string): Promise<ArrayBuffer> {
  const keyBytes =
    typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const rawKey =
    keyBytes instanceof Uint8Array
      ? new Uint8Array(keyBytes).buffer
      : keyBytes;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(digest);
}

async function signingKey(secret: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmac(`AWS4${secret}`, date);
  const kRegion = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function assertAllowedKey(key: string, userId: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.length > 512
  ) {
    throw new Error('Invalid object key.');
  }

  const parts = key.split('/');
  const [root, maybeTypeOrUser, maybeUser] = parts;
  if (!ALLOWED_ROOTS.has(root)) throw new Error('Object path is not allowed.');

  const ownerId =
    root === 'posts'
      ? maybeUser
      : maybeTypeOrUser;

  if (ownerId !== userId) throw new Error('Object path does not match the current user.');
}

function assertAllowedRoot(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.length > 512
  ) {
    throw new Error('Invalid object key.');
  }

  const [root] = key.split('/');
  if (!ALLOWED_ROOTS.has(root)) throw new Error('Object path is not allowed.');
}

function keyFromUrl(url: string): string | null {
  const publicBaseUrl = env('R2_PUBLIC_URL').replace(/\/+$/, '');
  if (!url.startsWith(`${publicBaseUrl}/`)) return null;
  return decodeURIComponent(url.slice(publicBaseUrl.length + 1));
}

async function getUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header.');
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const userJwt = authHeader.slice(7).trim();

  const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${userJwt}`,
      'apikey': serviceRoleKey,
    },
  });

  if (!authResp.ok) throw new Error('Unauthorized.');
  const authData = await authResp.json();
  const userId = authData?.id;
  if (typeof userId !== 'string' || !userId) throw new Error('Unauthorized.');
  return userId;
}

function isAdminCleanup(req: Request): boolean {
  const cleanupSecret = Deno.env.get('R2_CLEANUP_SECRET');
  if (cleanupSecret && req.headers.get('x-cleanup-secret') === cleanupSecret) {
    return true;
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('authorization') ?? '';
  return !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;
}

function serviceHeaders(): HeadersInit {
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return {
    'Authorization': `Bearer ${serviceRoleKey}`,
    'apikey': serviceRoleKey,
    'Content-Type': 'application/json',
  };
}

async function updateQueueRow(
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = env('SUPABASE_URL');
  const response = await fetch(`${supabaseUrl}/rest/v1/r2_delete_queue?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      ...serviceHeaders(),
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Queue update failed (${response.status}): ${text.substring(0, 200)}`);
  }
}

async function restRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabaseUrl = env('SUPABASE_URL');
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...serviceHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

async function deleteObject(key: string): Promise<void> {
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET_NAME');

  const now = new Date();
  const date = yyyymmdd(now);
  const timestamp = amzDate(now);
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodePath(key)}`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${timestamp}\n`;

  const canonicalRequest = [
    'DELETE',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signing = await signingKey(secretAccessKey, date);
  const signature = toHex(await hmac(signing, stringToSign));
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      'Authorization': authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': timestamp,
    },
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    throw new Error(`R2 delete failed (${response.status}): ${text.substring(0, 200)}`);
  }
}

async function processDeleteQueue(limit: number): Promise<{
  processed: number;
  deleted: number;
  failed: number;
}> {
  const supabaseUrl = env('SUPABASE_URL');
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const queueUrl =
    `${supabaseUrl}/rest/v1/r2_delete_queue?` +
    `status=eq.pending&select=id,media_url,thumbnail_url,attempts&order=created_at.asc&limit=${safeLimit}`;

  const response = await fetch(queueUrl, { headers: serviceHeaders() });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Queue fetch failed (${response.status}): ${text.substring(0, 200)}`);
  }

  const rows = await response.json() as QueueRow[];
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    const keys = Array.from(
      new Set(
        [row.media_url, row.thumbnail_url]
          .map((url) => (url ? keyFromUrl(url) : null))
          .filter((key): key is string => !!key),
      ),
    );

    try {
      for (const key of keys) assertAllowedRoot(key);
      await Promise.all(keys.map(deleteObject));
      await updateQueueRow(row.id, {
        status: 'deleted',
        attempts: row.attempts + 1,
        last_error: null,
        processed_at: new Date().toISOString(),
      });
      deleted += keys.length;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await updateQueueRow(row.id, {
        status: 'error',
        attempts: row.attempts + 1,
        last_error: message.substring(0, 500),
        processed_at: new Date().toISOString(),
      });
    }
  }

  return { processed: rows.length, deleted, failed };
}

async function runSelfTest(): Promise<{
  postDeleted: boolean;
  queueRows: number;
  queueProcessed: number;
  queueFailed: number;
}> {
  const authorResponse = await restRequest('profiles?select=id&limit=1');
  if (!authorResponse.ok) {
    const text = await authorResponse.text().catch(() => '');
    throw new Error(`Self-test author fetch failed (${authorResponse.status}): ${text.substring(0, 200)}`);
  }

  const authors = await authorResponse.json() as Array<{ id: string }>;
  const authorId = authors[0]?.id;
  if (!authorId) throw new Error('Self-test needs at least one profile.');

  const testId = crypto.randomUUID();
  const publicBaseUrl = env('R2_PUBLIC_URL').replace(/\/+$/, '');
  const mediaUrl = `${publicBaseUrl}/posts/images/${authorId}/self-test-${testId}.webp`;

  const postResponse = await restRequest('posts', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      id: testId,
      author_id: authorId,
      caption: 'r2 cleanup self-test',
      media_url: mediaUrl,
      thumbnail_url: mediaUrl,
      media_type: 'image',
    }),
  });
  if (!postResponse.ok) {
    const text = await postResponse.text().catch(() => '');
    throw new Error(`Self-test post insert failed (${postResponse.status}): ${text.substring(0, 200)}`);
  }

  const deleteResponse = await restRequest(`posts?id=eq.${testId}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' },
  });
  if (!deleteResponse.ok) {
    const text = await deleteResponse.text().catch(() => '');
    await restRequest(`posts?id=eq.${testId}`, { method: 'DELETE' });
    throw new Error(`Self-test post delete failed (${deleteResponse.status}): ${text.substring(0, 200)}`);
  }

  const queueResponse = await restRequest(
    `r2_delete_queue?post_id=eq.${testId}&select=id,status`,
  );
  if (!queueResponse.ok) {
    const text = await queueResponse.text().catch(() => '');
    throw new Error(`Self-test queue fetch failed (${queueResponse.status}): ${text.substring(0, 200)}`);
  }

  const rows = await queueResponse.json() as Array<{ id: string; status: string }>;
  const result = await processDeleteQueue(10);

  return {
    postDeleted: true,
    queueRows: rows.length,
    queueProcessed: result.processed,
    queueFailed: result.failed,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await req.json() as DeleteRequest;

    if (body.processQueue) {
      const result = await processDeleteQueue(body.limit ?? 20);
      return new Response(
        JSON.stringify({ ok: true, ...result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adminCleanup = isAdminCleanup(req);
    if (body.selfTest) {
      if (!adminCleanup) throw new Error('Unauthorized.');
      const result = await runSelfTest();
      return new Response(
        JSON.stringify({ ok: true, ...result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = adminCleanup ? null : await getUserId(req);
    const keysFromUrls = (body.urls ?? [])
      .map(keyFromUrl)
      .filter((key): key is string => !!key);
    const keys = Array.from(new Set([...(body.keys ?? []), ...keysFromUrls]));

    for (const key of keys) {
      if (adminCleanup) {
        assertAllowedRoot(key);
      } else {
        assertAllowedKey(key, userId!);
      }
    }
    await Promise.all(keys.map(deleteObject));

    return new Response(
      JSON.stringify({ ok: true, deleted: keys.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'Unauthorized.' || message === 'Missing authorization header.'
      ? 401
      : 400;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
