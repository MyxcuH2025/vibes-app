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
  return !!cleanupSecret && req.headers.get('x-cleanup-secret') === cleanupSecret;
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
    const adminCleanup = isAdminCleanup(req);
    const userId = adminCleanup ? null : await getUserId(req);
    const body = await req.json() as DeleteRequest;
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
