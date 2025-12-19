
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllPosts() {
    let allPosts = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    console.log('📥 Fetching all posts from instagram_posts...');

    while (hasMore) {
        const { data, error } = await supabase
            .from('instagram_posts')
            .select('*')
            .range(from, from + step - 1)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching data:', error);
            break;
        }

        allPosts = allPosts.concat(data);
        console.log(`   Fetched ${allPosts.length} posts...`);

        if (data.length < step) {
            hasMore = false;
        } else {
            from += step;
        }
    }

    return allPosts;
}

async function detailedAnalysis() {
    const allPosts = await fetchAllPosts();
    const total = allPosts.length;

    console.log('\n🔍 RUNNING COMPREHENSIVE POST ANALYSIS (FULL DATASET)');
    console.log('='.repeat(70));
    console.log(`📊 OVERALL STATS:`);
    console.log(`  Total Posts: ${total}`);

    const isEventTrue = allPosts.filter(p => p.is_event === true);
    const isEventFalse = allPosts.filter(p => p.is_event === false);
    const isEventNull = allPosts.filter(p => p.is_event === null);

    console.log(`  is_event: true  -> ${isEventTrue.length} (${Math.round(isEventTrue.length / total * 100)}%)`);
    console.log(`  is_event: false -> ${isEventFalse.length} (${Math.round(isEventFalse.length / total * 100)}%)`);
    console.log(`  is_event: null  -> ${isEventNull.length} (${Math.round(isEventNull.length / total * 100)}%)`);

    // Review Tiers
    const tiers = {};
    allPosts.forEach(p => {
        const t = p.review_tier || 'none';
        tiers[t] = (tiers[t] || 0) + 1;
    });
    console.log(`\n📋 REVIEW TIERS:`);
    Object.entries(tiers).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
        console.log(`  ${t.padEnd(12)}: ${c}`);
    });

    // Confidence buckets
    const confBuckets = {
        '90-100%': 0,
        '70-89%': 0,
        '50-69%': 0,
        'Below 50%': 0,
        'Null': 0
    };

    allPosts.forEach(p => {
        if (p.ai_confidence === null) confBuckets['Null']++;
        else if (p.ai_confidence >= 0.9) confBuckets['90-100%']++;
        else if (p.ai_confidence >= 0.7) confBuckets['70-89%']++;
        else if (p.ai_confidence >= 0.5) confBuckets['50-69%']++;
        else confBuckets['Below 50%']++;
    });

    console.log(`\n🤖 AI CONFIDENCE DISTRIBUTION:`);
    Object.entries(confBuckets).forEach(([bucket, count]) => {
        console.log(`  ${bucket.padEnd(12)}: ${count} (${Math.round(count / total * 100)}%)`);
    });

    // Patterns for is_event: false
    console.log(`\n❌ REJECTION PATTERNS (is_event: false):`);
    const keywords = [
        { key: 'past', pattern: /past|previous|already happened|recap|throwback|last night|yesterday|reminisc/i },
        { key: 'operating hours', pattern: /operating hours|regular hours|daily|every|mon-fri/i },
        { key: 'teaser', pattern: /teaser|announcement|coming soon/i },
        { key: 'menu/price list', pattern: /menu|price list|rate sheet/i },
        { key: 'generic', pattern: /generic|no specific|missing date|missing venue/i },
        { key: 'outside ncr', pattern: /outside ncr|not in manila|not in metro/i }
    ];

    const keywordStats = {};
    keywords.forEach(k => keywordStats[k.key] = 0);
    keywordStats['other'] = 0;

    isEventFalse.forEach(p => {
        let matched = false;
        keywords.forEach(k => {
            if (k.pattern.test(p.ai_reasoning)) {
                keywordStats[k.key]++;
                matched = true;
            }
        });
        if (!matched) keywordStats['other']++;
    });

    Object.entries(keywordStats).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
        console.log(`  ${k.padEnd(16)}: ${c} (${Math.round(c / (isEventFalse.length || 1) * 100)}%)`);
    });

    // Multi-day events
    const multiDay = isEventTrue.filter(p => p.event_end_date !== null);
    console.log(`\n📅 MULTI-DAY EVENTS (is_event: true):`);
    console.log(`  Total: ${multiDay.length} (${Math.round(multiDay.length / (isEventTrue.length || 1) * 100)}% of events)`);

    // Ongoing events bugs
    const ongoingInFalse = isEventFalse.filter(p => /happening now|already started/i.test(p.ai_reasoning));
    console.log(`  ⚠️ Ongoing events REJECTED (potential bug): ${ongoingInFalse.length}`);
    if (ongoingInFalse.length > 0) {
        console.log('    Samples:');
        ongoingInFalse.slice(0, 5).forEach(p => {
            console.log(`    - [${p.id}] ${p.event_title}: ${p.ai_reasoning.slice(0, 100)}...`);
        });
    }

    // Generic titles in true events
    const generics = isEventTrue.filter(p => p.event_title && /see you|join us|reminders|final check|coming up|happening|tonight|weekend|ready/i.test(p.event_title));
    console.log(`\n🏷️ GENERIC TITLES IN TRUE EVENTS:`);
    console.log(`  Total: ${generics.length}`);
    generics.slice(0, 10).forEach(p => console.log(`    - ${p.event_title} (${p.post_url})`));

    // Handle extraction method distribution
    const methods = {};
    allPosts.forEach(p => {
        // Since we didn't always store method in a dedicated column, we might check ai_reasoning or other hints if needed
        // But for now let's just use what's available
    });

    console.log('\n✅ Analysis complete.');
}

detailedAnalysis().catch(console.error);
