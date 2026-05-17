-- ================================================
-- R2 media cleanup queue
-- Captures media URLs when posts are deleted, regardless of which client
-- performed the delete. The r2-delete Edge Function processes this queue.
-- ================================================

CREATE TABLE IF NOT EXISTS public.r2_delete_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID,
  author_id     UUID,
  media_url     TEXT,
  thumbnail_url TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'deleted', 'error')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_r2_delete_queue_pending
  ON public.r2_delete_queue (created_at)
  WHERE status = 'pending';

ALTER TABLE public.r2_delete_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct client access to r2_delete_queue" ON public.r2_delete_queue;

CREATE OR REPLACE FUNCTION public.enqueue_r2_media_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.media_url IS NOT NULL OR OLD.thumbnail_url IS NOT NULL THEN
    INSERT INTO public.r2_delete_queue (
      post_id,
      author_id,
      media_url,
      thumbnail_url
    )
    VALUES (
      OLD.id,
      OLD.author_id,
      OLD.media_url,
      OLD.thumbnail_url
    );
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_r2_media_delete_on_post_delete ON public.posts;
CREATE TRIGGER enqueue_r2_media_delete_on_post_delete
  AFTER DELETE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_r2_media_delete();
