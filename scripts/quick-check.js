
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data } = await supabase.from('instagram_posts').select('event_title, location_name').eq('is_event', true);

    const genericTitles = data.filter(d => d.event_title && /see you|join us|reminders|final check|coming up|happening|tonight|weekend|ready/i.test(d.event_title));
    const handleVenues = data.filter(d => d.location_name && (/@/i.test(d.location_name) || /_/i.test(d.location_name)));

    console.log('Generic Titles found:', genericTitles.length);
    genericTitles.slice(0, 20).forEach(t => console.log('  -', t.event_title));

    console.log('\nHandle/Underscore Venues found:', handleVenues.length);
    handleVenues.slice(0, 20).forEach(v => console.log('  -', v.location_name));
}

run().catch(console.error);
