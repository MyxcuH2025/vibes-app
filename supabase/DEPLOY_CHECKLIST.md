# Vibes App – Supabase Deploy-Checkliste

Jedes Mal wenn du ein neues Supabase-Projekt aufsetzt oder nach einem Reset,
müssen alle Schritte unten in dieser Reihenfolge ausgeführt werden.

---

## Reihenfolge: SQL-Dateien im SQL Editor ausführen

| # | Datei | Was es macht |
|---|-------|--------------|
| 1 | `schema.sql` | Alle Tabellen (profiles, posts, guilds, follows, likes, …) |
| 2 | `guilds_setup.sql` | Guild-Tabelle + Seed-Daten (Pod Alpha–Epsilon) |
| 3 | `onboarding.sql` | onboarding_complete Flag, Guild-Zuweisung |
| 4 | `follows.sql` | follows-Tabelle + RLS |
| 5 | `likes.sql` | likes-Tabelle + RLS |
| 6 | `comments.sql` | comments-Tabelle + RLS |
| 7 | `bookmarks.sql` | bookmarks-Tabelle + RLS |
| 8 | `messages.sql` | conversations + messages Tabellen + RLS |
| 9 | `notifications.sql` | notifications-Tabelle + Trigger für like/comment/follow |
| 10 | `stories.sql` | stories-Tabelle + RLS |
| 11 | `reports.sql` | reports-Tabelle + RLS |
| 12 | `dwell_time.sql` | post_dwell_log + update_dwell_time RPC |
| 13 | `vibe_scores.sql` | score_explore, score_brain Felder + Berechnung |
| 14 | `vibe_feed_rpc.sql` | **get_vibe_feed** RPC (Kern-Algorithmus) |
| 15 | `guild_leaderboard.sql` | get_guild_leaderboard + get_guild_feed RPCs |
| 16 | `feed_engagement_batch.sql` | get_post_like_counts + get_post_comment_counts RPCs |
| 17 | `get_conversations.sql` | get_conversations + get_follow_counts RPCs |
| 18 | `post_management.sql` | delete_post + edit_post RPCs |
| 19 | `algorithm_indexes.sql` | Performance-Indizes für Feed-Queries |
| 20 | `algorithm_production.sql` | Produktions-optimierte Feed-Version |
| 21 | `algorithm_decay.sql` | decay_dwell_scores Funktion |
| 22 | `schedule_decay.sql` | pg_cron Job für Score-Decay (täglich) |
| 23 | `push_notifications.sql` | push_tokens Tabelle + Trigger |
| 24 | `storage.sql` | **Storage Buckets**: posts (50MB) + avatars (5MB) |
| 25 | `r2_media_cleanup.sql` | Queue + Trigger für R2-Cleanup nach Post-Delete |
| 26 | `r2_media_cleanup_cron.sql` | Cron-Job zum Abarbeiten der R2-Cleanup-Queue |

---

## RPCs die zwingend existieren müssen (App bricht sonst)

| RPC | Genutzt in | Fallback? |
|-----|-----------|-----------|
| `get_vibe_feed` | Feed-Screen | ✅ Ja – direkter posts-Query ohne Personalisierung |
| `get_guild_feed` | Guild-Screen | ❌ Nein – leerer Feed |
| `get_conversations` | DM-Liste | ❌ Nein – leere Inbox |
| `get_follow_counts` | Profil, User-Seite | ❌ Nein – 0/0 angezeigt |
| `update_dwell_time` | Dwell-Tracker (Feed) | ✅ Ja – Daten gehen verloren, kein Crash |
| `get_post_like_counts` | Feed-Engagement | ✅ Ja – N einzelne Queries als Fallback |
| `get_post_comment_counts` | Feed-Engagement | ✅ Ja – N einzelne Queries als Fallback |

---

## Storage Buckets

| Bucket | Zweck | Limit | Genutzt von |
|--------|-------|-------|-------------|
| `posts` | Post-Bilder + Videos | 50 MB | `uploadPostMedia()` |
| `avatars` | Profilbilder | 5 MB | `uploadAvatar()` |

---

## Verifikation nach Deploy

Führe `verify_functions.sql` im SQL Editor aus – er prüft:
- Welche Funktionen existieren
- Ob `update_dwell_time` den Gaming-Schutz hat
- Ob `get_vibe_feed` den `filter_tag` Parameter hat
- Ob alle Tabellen vorhanden sind

---

## Edge Functions (optional, für Score-Decay)

```bash
supabase functions deploy decay-scores
```

Danach `schedule_decay.sql` ausführen um den täglichen Cron-Job zu aktivieren.
Ohne diesen Job verfallen Scores nicht → alte Posts bleiben ewig oben im Feed.

## Edge Functions (R2 Media)

```bash
supabase functions deploy r2-sign --project-ref <project-ref>
supabase functions deploy r2-delete --project-ref <project-ref> --no-verify-jwt
```

`r2-delete` prüft User-JWTs intern und nutzt `R2_CLEANUP_SECRET` nur für Admin-Cleanup
oder Queue-Verarbeitung.
