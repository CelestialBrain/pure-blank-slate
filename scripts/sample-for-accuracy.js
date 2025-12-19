
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZGNzaGp6a2NpZHFta3B4dXF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk4OTQ1MSwiZXhwIjoyMDgxNTY1NDUxfQ.A61mypyJQHwqK2IrRLsMDK7tHGWOM1WJCcjnoTyjX_8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sampleEvents() {
    console.log('Fetching event samples...');

    const { data: events, error } = await supabase
        .from('instagram_posts')
        .select('id, event_title, event_date, event_end_date, event_time, location_name, price, caption, ocr_text, ai_confidence, ai_reasoning, is_event, post_url')
        .not('event_end_date', 'is', null)
        .limit(20);

    if (error) {
        console.error('Error fetching events:', error);
        return;
    }

    console.log(JSON.stringify(events, null, 2));
}

sampleEvents();
