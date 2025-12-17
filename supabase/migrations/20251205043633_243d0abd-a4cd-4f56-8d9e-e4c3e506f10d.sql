-- Create extraction_ground_truth table for storing verified correct values
CREATE TABLE IF NOT EXISTS extraction_ground_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES instagram_posts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  ground_truth_value TEXT NOT NULL,
  source TEXT DEFAULT 'admin_correction',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE extraction_ground_truth ENABLE ROW LEVEL SECURITY;

-- Policies for extraction_ground_truth
DO $$ BEGIN
  CREATE POLICY "Admins can manage ground truth" ON extraction_ground_truth
    FOR ALL USING (has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Admins can manage ground truth" already exists, skipping';
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view ground truth" ON extraction_ground_truth
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Authenticated users can view ground truth" already exists, skipping';
END $$;

-- Create pattern_suggestions table for tracking suggested patterns
CREATE TABLE IF NOT EXISTS pattern_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  suggested_regex TEXT NOT NULL,
  sample_text TEXT,
  expected_value TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE pattern_suggestions ENABLE ROW LEVEL SECURITY;

-- Policies for pattern_suggestions
DO $$ BEGIN
  CREATE POLICY "Admins can manage pattern suggestions" ON pattern_suggestions
    FOR ALL USING (has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Admins can manage pattern suggestions" already exists, skipping';
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can create suggestions" ON pattern_suggestions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Authenticated users can create suggestions" already exists, skipping';
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view suggestions" ON pattern_suggestions
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'policy "Authenticated users can view suggestions" already exists, skipping';
END $$;
