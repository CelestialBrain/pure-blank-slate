-- Add artists column to instagram_posts
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS artists jsonb DEFAULT NULL;

COMMENT ON COLUMN public.instagram_posts.artists IS 'Array of performers, DJs, or guest speakers identified in the post.';
