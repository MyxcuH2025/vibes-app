// Supabase Edge Function: send-push-notification
// Aufgerufen von: DB-Trigger auf notifications-Tabelle
// Sendet via Expo Push API an den Empfänger

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationPayload {
  record: {
    id: string;
    recipient_id?: string; // notifications.recipient_id
    sender_id?: string;    // notifications.sender_id
    user_id?: string;      // Legacy: Empfänger
    actor_id?: string;     // Legacy: Auslöser
    type: string;          // 'like' | 'comment' | 'follow' | 'dm' | 'live'
    post_id?: string;
    comment_text?: string;
    message?: string;
    session_id?: string;   // Live-Session ID (für 'live' type)
  };
}

type ExpoTokenRow = { token: string };
type ProfilePushRow = { expo_push_token: string | null };

Deno.serve(async (req: Request) => {
  try {
    const payload: NotificationPayload = await req.json();
    const { record } = payload;
    const recipientId = record.recipient_id ?? record.user_id;
    const actorId = record.sender_id ?? record.actor_id;

    if (!recipientId) {
      return new Response(JSON.stringify({ error: 'Missing recipient id' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Primaer: Multi-Device Tokens. Fallback: alter profiles.expo_push_token.
    const { data: tokenRows } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', recipientId);
    const tokens = ((tokenRows ?? []) as ExpoTokenRow[])
      .map((row) => row.token)
      .filter(Boolean);

    if (tokens.length === 0) {
      const { data: profilePush } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('id', recipientId)
        .maybeSingle();
      const fallbackToken = (profilePush as ProfilePushRow | null)?.expo_push_token;
      if (fallbackToken) tokens.push(fallbackToken);
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ skipped: 'No push token' }), { status: 200 });
    }

    // Auslöser-Username holen
    const { data: actor } = actorId
      ? await supabase
          .from('profiles')
          .select('username')
          .eq('id', actorId)
          .maybeSingle()
      : { data: null };

    const actorName = actor?.username ?? 'Jemand';

    // Notification-Text basierend auf Typ
    const messages: Record<string, { title: string; body: string }> = {
      like:    { title: '❤️ Neuer Like',       body: `${actorName} mag deinen Vibe` },
      comment: { title: '💬 Neuer Kommentar',   body: record.comment_text ?? `${actorName} hat kommentiert` },
      follow:  { title: '👤 Neuer Follower',    body: `${actorName} folgt dir jetzt` },
      dm:      { title: '✉️ Neue Nachricht',    body: record.message ?? `${actorName} schreibt dir` },
      live:    { title: '🔴 Live auf Vibes',     body: `${actorName} ist jetzt LIVE!${record.message ? ` — ${record.message}` : ''}` },
    };

    const msg = messages[record.type] ?? { title: 'Neue Aktivität auf Vibes', body: '' };

    // Expo Push API aufrufen
    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(tokens.map((token) => ({
        to: token,
        title: msg.title,
        body: msg.body,
        data: { type: record.type, postId: record.post_id, sessionId: record.session_id },
        sound: 'default',
        priority: 'high',
      }))),
    });

    const result = await pushRes.json();
    console.log('[push] Expo response:', JSON.stringify(result));

    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  } catch (err) {
    console.error('[push] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
