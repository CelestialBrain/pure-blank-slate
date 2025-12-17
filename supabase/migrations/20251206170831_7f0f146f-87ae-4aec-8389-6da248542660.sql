-- Phase 2.1: Add 40+ missing venues to known_venues table
-- Phase 3.1: Add recurring event columns

-- Add recurring event columns to instagram_posts
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text;

COMMENT ON COLUMN public.instagram_posts.is_recurring IS 'True if event repeats (Every Friday, Weekly, etc.)';
COMMENT ON COLUMN public.instagram_posts.recurrence_pattern IS 'Pattern like weekly:friday, monthly:first-saturday, biweekly:saturday';

-- Add urgency score column for sorting
ALTER TABLE public.instagram_posts 
ADD COLUMN IF NOT EXISTS urgency_score integer DEFAULT 0;

COMMENT ON COLUMN public.instagram_posts.urgency_score IS 'Urgency score for sorting: Today +100, Tomorrow +80, This Week +50, etc.';

-- Add same columns to published_events for consistency
ALTER TABLE public.published_events 
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text,
ADD COLUMN IF NOT EXISTS urgency_score integer DEFAULT 0;

-- Insert 40+ missing venues (Poblacion bars, clubs, art spaces, cafes)
-- Venue INSERT commented out - venues seeded via scripts/seed-known-venues.js

-- Create index for faster urgency sorting
CREATE INDEX IF NOT EXISTS idx_instagram_posts_urgency ON public.instagram_posts (urgency_score DESC, event_date ASC) WHERE is_event = true;