
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSubevents() {
    const { data, error } = await supabase
        .from('instagram_posts')
        .select('event_title, ai_reasoning, caption, ocr_text')
        .eq('is_event', true)
        .limit(20);

    if (error) {
        console.error(error);
        return;
    }

    data.forEach(p => {
        console.log('='.repeat(40));
        console.log(`TITLE: ${p.event_title}`);
        console.log(`REASONING: ${p.ai_reasoning}`);

        const captionLineup = p.caption ? p.caption.split('\n').filter(l => l.includes('@') || l.includes(' w/ ') || l.includes(' feat ')).slice(0, 3).join(' | ') : 'None';
        console.log(`LINEUP HINT: ${captionLineup}`);
    });
}

checkSubevents().catch(console.error);
