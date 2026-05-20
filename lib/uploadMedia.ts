import { File as ExpoFile } from 'expo-file-system';
import { supabase } from './supabase';
import { useAuthStore } from './authStore';

type UploadResult = {
  url: string;
  path: string;
};

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
function mimeToExt(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mov')) return 'mov';
  if (mimeType.includes('video')) return 'mp4';
  return 'jpg';
}

function isVideo(mimeType: string): boolean {
  return (
    mimeType.includes('video') ||
    mimeType.includes('mp4') ||
    mimeType.includes('mov') ||
    mimeType.includes('quicktime')
  );
}

function normalizeMime(raw: string | null | undefined): string {
  return (raw || 'image/jpeg').trim();
}

function getAccessToken(): string {
  const accessToken = useAuthStore.getState().session?.access_token;
  if (!accessToken) throw new Error('Nicht eingeloggt.');
  return accessToken;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T> {
  let lastError = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}

async function readLocalFile(localUri: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (signal?.aborted) throw new Error('Upload abgebrochen.');

  try {
    const buffer = await new ExpoFile(localUri).arrayBuffer();
    if (buffer.byteLength > 0) return buffer;
  } catch (err) {
    if (__DEV__) console.warn('[upload] ExpoFile read failed, falling back to fetch', err);
  }

  const response = await fetch(localUri, { signal });
  if (!response.ok) {
    throw new Error(`Lokale Datei nicht lesbar (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('Lokale Datei ist leer oder konnte nicht gelesen werden.');
  }
  return buffer;
}

async function uploadToR2(
  key: string,
  localUri: string,
  rawMimeType: string | null | undefined,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const accessToken = getAccessToken();
  const mimeType = normalizeMime(rawMimeType);

  onProgress?.(5);
  const fileBuffer = await readLocalFile(localUri, signal);

  const maxBytes = isVideo(mimeType) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (fileBuffer.byteLength > maxBytes) {
    const limitMB = Math.round(maxBytes / 1024 / 1024);
    const fileMB = (fileBuffer.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Datei zu gross: ${fileMB} MB (Maximum: ${limitMB} MB fuer ${
        isVideo(mimeType) ? 'Videos' : 'Bilder'
      })`,
    );
  }

  onProgress?.(15);
  const { uploadUrl, publicUrl } = await withRetry(
    async () => {
      if (signal?.aborted) throw new Error('Upload abgebrochen.');
      const { data, error } = await supabase.functions.invoke('r2-sign', {
        body: {
          key,
          contentType: mimeType,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error || !data?.uploadUrl || !data?.publicUrl) {
        throw new Error(`Sign-Fehler: ${error?.message ?? 'Keine Upload-URL'}`);
      }

      return data as { uploadUrl: string; publicUrl: string };
    },
    3,
    (attempt, err) => {
      onProgress?.(10);
      if (__DEV__) console.warn(`[r2-sign] Versuch ${attempt} fehlgeschlagen: ${err.message}`);
    },
  );

  onProgress?.(20);
  let simPct = 20;
  const simInterval = setInterval(() => {
    simPct = Math.min(simPct + 8, 90);
    onProgress?.(simPct);
  }, 600);

  try {
    await withRetry(
      async () => {
        if (signal?.aborted) throw new Error('Upload abgebrochen.');
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
          },
          body: fileBuffer,
          signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '(kein Body)');
          throw new Error(`R2 Upload fehlgeschlagen (${response.status}): ${text.substring(0, 500)}`);
        }
      },
      3,
      (attempt, err) => {
        simPct = 20;
        onProgress?.(20);
        if (__DEV__) console.warn(`[r2-upload] Versuch ${attempt} fehlgeschlagen: ${err.message}`);
      },
    );
  } finally {
    clearInterval(simInterval);
  }

  onProgress?.(100);
  return { url: publicUrl, path: key };
}

export async function uploadPostMedia(
  userId: string,
  localUri: string,
  mimeType?: string | null,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const resolvedMime = normalizeMime(mimeType);
  const ext = mimeToExt(resolvedMime);
  const folder = isVideo(resolvedMime) ? 'videos' : 'images';
  const key = `posts/${folder}/${userId}/${Date.now()}.${ext}`;
  return uploadToR2(key, localUri, resolvedMime, onProgress, signal);
}

async function uploadThumbnail(
  userId: string,
  localUri: string,
  signal?: AbortSignal,
): Promise<string> {
  const key = `thumbnails/${userId}/${Date.now()}.jpg`;
  const { url } = await uploadToR2(key, localUri, 'image/jpeg', undefined, signal);
  return url;
}

export async function generateAndUploadThumbnail(
  userId: string,
  videoUri: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const VideoThumbnails = await import('expo-video-thumbnails');
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 250,
      quality: 0.75,
    });

    if (!uri) return null;
    return uploadThumbnail(userId, uri, signal);
  } catch (err) {
    if (__DEV__) console.warn('[generateAndUploadThumbnail]', err);
    return null;
  }
}

export async function uploadAvatar(
  userId: string,
  localUri: string,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const key = `avatars/${userId}/${Date.now()}.jpg`;
  return uploadToR2(key, localUri, 'image/jpeg', undefined, signal);
}
