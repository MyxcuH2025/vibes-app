/**
 * Supabase Edge Function: r2-sign
 *
 * Returns a short-lived Cloudflare R2 presigned PUT URL for authenticated users.
 *
 * Required secrets:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME
 * - R2_PUBLIC_URL
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SignRequest = {
  key?: string;
  contentType?: string;
  cacheControl?: string;
};

const ALLOWED_ROOTS = new Set(['posts', 'thumbnails', 'avatars']);
const MAX_EXPIRES_SECONDS = 300;

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

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
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
    throw new Error('Invalid upload key.');
  }

  const parts = key.split('/');
  const [root, maybeTypeOrUser, maybeUser] = parts;
  if (!ALLOWED_ROOTS.has(root)) throw new Error('Upload path is not allowed.');

  const ownerId =
    root === 'posts'
      ? maybeUser
      : maybeTypeOrUser;

  if (ownerId !== userId) throw new Error('Upload path does not match the current user.');
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

async function createPresignedPutUrl(params: {
  key: string;
  contentType: string;
  cacheControl: string;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = env('R2_ACCOUNT_ID');
  const accessKeyId = env('R2_ACCESS_KEY_ID');
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY');
  const bucket = env('R2_BUCKET_NAME');
  const publicBaseUrl = env('R2_PUBLIC_URL').replace(/\/+$/, '');

  const now = new Date();
  const date = yyyymmdd(now);
  const timestamp = amzDate(now);
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodePath(params.key)}`;
  const signedHeaders = 'cache-control;content-type;host';

  const queryEntries: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', timestamp],
    ['X-Amz-Expires', String(MAX_EXPIRES_SECONDS)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];

  const canonicalQuery = queryEntries
    .map(([k, v]) => `${encodeQueryValue(k)}=${encodeQueryValue(v)}`)
    .sort()
    .join('&');

  const canonicalHeaders =
    `cache-control:${params.cacheControl}\n` +
    `content-type:${params.contentType}\n` +
    `host:${host}\n`;

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const key = await signingKey(secretAccessKey, date);
  const signature = toHex(await hmac(key, stringToSign));
  const uploadUrl =
    `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const publicUrl = `${publicBaseUrl}/${encodePath(params.key)}`;

  return { uploadUrl, publicUrl };
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
    const userId = await getUserId(req);
    const body = await req.json() as SignRequest;
    const key = String(body.key ?? '');
    const contentType = String(body.contentType ?? 'application/octet-stream');
    const cacheControl = String(body.cacheControl ?? 'public, max-age=31536000, immutable');

    assertAllowedKey(key, userId);

    if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) {
      throw new Error('Invalid content type.');
    }

    const signed = await createPresignedPutUrl({ key, contentType, cacheControl });
    return new Response(
      JSON.stringify(signed),
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
