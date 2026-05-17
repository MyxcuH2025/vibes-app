-- ================================================
-- Canonical post mutation RPCs
-- Web and Mobile should use these RPCs instead of direct table mutations.
-- ================================================

CREATE OR REPLACE FUNCTION public.create_post(
  p_caption       TEXT DEFAULT NULL,
  p_media_url     TEXT DEFAULT NULL,
  p_media_type    TEXT DEFAULT 'image',
  p_thumbnail_url TEXT DEFAULT NULL,
  p_tags          TEXT[] DEFAULT '{}'::TEXT[],
  p_guild_id      UUID DEFAULT NULL,
  p_is_guild_post BOOLEAN DEFAULT FALSE
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
    is_guild_post
  )
  VALUES (
    v_user_id,
    NULLIF(BTRIM(p_caption), ''),
    p_media_url,
    COALESCE(p_media_type, 'image'),
    p_thumbnail_url,
    COALESCE(p_tags, '{}'::TEXT[]),
    p_guild_id,
    COALESCE(p_is_guild_post, FALSE)
  )
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_post(
  p_post_id UUID,
  p_caption TEXT DEFAULT NULL,
  p_tags    TEXT[] DEFAULT '{}'::TEXT[]
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
         tags    = COALESCE(p_tags, '{}'::TEXT[])
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

REVOKE ALL ON FUNCTION public.create_post(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, BOOLEAN)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_post(TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, BOOLEAN)
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_post(UUID, TEXT, TEXT[])
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_post(UUID, TEXT, TEXT[])
  TO authenticated;

REVOKE ALL ON FUNCTION public.delete_post(UUID)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_post(UUID)
  TO authenticated;
