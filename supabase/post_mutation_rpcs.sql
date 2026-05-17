-- ================================================
-- Canonical post mutation RPCs
-- Web and Mobile should use these RPCs instead of direct table mutations.
-- ================================================

DROP FUNCTION IF EXISTS public.create_post(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.update_post(UUID, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.create_post(
  p_caption       TEXT DEFAULT NULL,
  p_media_url     TEXT DEFAULT NULL,
  p_media_type    TEXT DEFAULT 'image',
  p_thumbnail_url TEXT DEFAULT NULL,
  p_tags          TEXT[] DEFAULT '{}'::TEXT[],
  p_guild_id      UUID DEFAULT NULL,
  p_is_guild_post BOOLEAN DEFAULT FALSE,
  p_audio_url      TEXT DEFAULT NULL,
  p_audio_volume   DOUBLE PRECISION DEFAULT NULL,
  p_privacy        TEXT DEFAULT 'public',
  p_allow_comments BOOLEAN DEFAULT TRUE,
  p_allow_download BOOLEAN DEFAULT FALSE,
  p_allow_duet     BOOLEAN DEFAULT TRUE,
  p_women_only     BOOLEAN DEFAULT FALSE,
  p_cover_time_ms  INTEGER DEFAULT NULL,
  p_aspect_ratio   TEXT DEFAULT 'portrait'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_post_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.posts (
    author_id,
    caption,
    media_url,
    media_type,
    thumbnail_url,
    tags,
    guild_id,
    is_guild_post,
    audio_url,
    audio_volume,
    privacy,
    allow_comments,
    allow_download,
    allow_duet,
    women_only,
    cover_time_ms,
    aspect_ratio
  )
  VALUES (
    v_user_id,
    NULLIF(BTRIM(p_caption), ''),
    p_media_url,
    COALESCE(p_media_type, 'image'),
    p_thumbnail_url,
    COALESCE(p_tags, '{}'::TEXT[]),
    p_guild_id,
    COALESCE(p_is_guild_post, FALSE),
    p_audio_url,
    p_audio_volume,
    COALESCE(p_privacy, 'public'),
    COALESCE(p_allow_comments, TRUE),
    COALESCE(p_allow_download, FALSE),
    COALESCE(p_allow_duet, TRUE),
    COALESCE(p_women_only, FALSE),
    p_cover_time_ms,
    COALESCE(p_aspect_ratio, 'portrait')
  )
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_post(
  p_post_id UUID,
  p_caption TEXT DEFAULT NULL,
  p_tags    TEXT[] DEFAULT '{}'::TEXT[],
  p_privacy        TEXT DEFAULT NULL,
  p_allow_comments BOOLEAN DEFAULT NULL,
  p_allow_download BOOLEAN DEFAULT NULL,
  p_allow_duet     BOOLEAN DEFAULT NULL,
  p_women_only     BOOLEAN DEFAULT NULL,
  p_aspect_ratio   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.posts
     SET caption = NULLIF(BTRIM(p_caption), ''),
         tags    = COALESCE(p_tags, '{}'::TEXT[]),
         privacy = COALESCE(p_privacy, privacy),
         allow_comments = COALESCE(p_allow_comments, allow_comments),
         allow_download = COALESCE(p_allow_download, allow_download),
         allow_duet = COALESCE(p_allow_duet, allow_duet),
         women_only = COALESCE(p_women_only, women_only),
         aspect_ratio = COALESCE(p_aspect_ratio, aspect_ratio)
   WHERE id = p_post_id
     AND author_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found or not owned by user';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_post(
  p_post_id UUID
)
RETURNS TABLE (
  author_id UUID,
  media_url TEXT,
  thumbnail_url TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  DELETE FROM public.posts p
   WHERE p.id = p_post_id
     AND p.author_id = auth.uid()
  RETURNING p.author_id, p.media_url, p.thumbnail_url;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found or not owned by user';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_post(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, BOOLEAN, TEXT, DOUBLE PRECISION, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, TEXT)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_post(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, BOOLEAN, TEXT, DOUBLE PRECISION, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_post(UUID, TEXT, TEXT[], TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_post(UUID, TEXT, TEXT[], TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.delete_post(UUID)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_post(UUID)
  TO authenticated;
