#!/usr/bin/env node

/**
 * Analyze Supabase scrape results
 * Checks recent extractions to verify AI changes are working
 */

const SUPABASE_URL = 'https://ltgxvskqotbuclrinhej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z3h2c2txb3RidWNscmluaGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjY1NTMsImV4cCI6MjA3NjgwMjU1M30.94ibR92U_ekHBl0BN0w-2eVSGMfPmgEa23AjInBk1hU';

async function querySupabase(table, options = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?`;

    if (options.select) url += `select=${options.select}&`;
    if (options.order) url += `order=${options.order}&`;
    if (options.limit) url += `limit=${options.limit}&`;
    if (options.filter) url += `${options.filter}&`;

    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Query failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

async function analyzeResults() {
    console.log('🔍 ANALYZING SUPABASE SCRAPE RESULTS\n');
    console.log('='.repeat(60));

    try {
        // 1. Get recent events (last 24 hours)
        console.log('\n📊 RECENT EVENTS (last 24 hours):');
        const events = await querySupabase('events', {
            select: 'id,title,event_date,venue,confidence,category,is_event,created_at',
            order: 'created_at.desc',
            limit: 50
        });

        console.log(`Total events found: ${events.length}`);

        // Filter to recent (today)
        const today = new Date().toISOString().split('T')[0];
        const recentEvents = events.filter(e => e.created_at?.startsWith(today));
        console.log(`Events created today: ${recentEvents.length}`);

        // 2. Analyze confidence distribution
        console.log('\n📈 CONFIDENCE DISTRIBUTION:');
        const confBuckets = { high: 0, medium: 0, low: 0, none: 0 };
        for (const e of events) {
            if (!e.confidence) confBuckets.none++;
            else if (e.confidence >= 0.8) confBuckets.high++;
            else if (e.confidence >= 0.5) confBuckets.medium++;
            else confBuckets.low++;
        }
        console.log(`  High (≥0.8): ${confBuckets.high}`);
        console.log(`  Medium (0.5-0.8): ${confBuckets.medium}`);
        console.log(`  Low (<0.5): ${confBuckets.low}`);
        console.log(`  No confidence: ${confBuckets.none}`);

        // 3. Category breakdown
        console.log('\n🏷️ CATEGORY BREAKDOWN:');
        const categories = {};
        for (const e of events) {
            const cat = e.category || 'uncategorized';
            categories[cat] = (categories[cat] || 0) + 1;
        }
        for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${cat}: ${count}`);
        }

        // 4. Sample of recent events
        console.log('\n📝 SAMPLE RECENT EVENTS:');
        for (const e of events.slice(0, 10)) {
            console.log(`\n  [${e.is_event ? 'EVENT' : 'NOT EVENT'}] ${e.title || '(no title)'}`);
            console.log(`    Date: ${e.event_date || 'TBD'} | Venue: ${e.venue || 'TBD'}`);
            console.log(`    Category: ${e.category || 'none'} | Confidence: ${e.confidence || 'N/A'}`);
            console.log(`    Created: ${e.created_at}`);
        }

        // 5. Check for potential issues
        console.log('\n⚠️ POTENTIAL ISSUES:');
        const noDate = events.filter(e => e.is_event && !e.event_date).length;
        const noVenue = events.filter(e => e.is_event && !e.venue).length;
        const lowConf = events.filter(e => e.confidence && e.confidence < 0.5).length;

        console.log(`  Events missing date: ${noDate}`);
        console.log(`  Events missing venue: ${noVenue}`);
        console.log(`  Low confidence extractions: ${lowConf}`);

        // 6. Check posts table for scrape status
        console.log('\n📸 RECENT POSTS (scrape status):');
        const posts = await querySupabase('posts', {
            select: 'id,caption,processed,extraction_method,created_at',
            order: 'created_at.desc',
            limit: 20
        });

        const processedPosts = posts.filter(p => p.processed);
        console.log(`Total recent posts: ${posts.length}`);
        console.log(`Processed posts: ${processedPosts.length}`);

        const methods = {};
        for (const p of posts) {
            const method = p.extraction_method || 'unknown';
            methods[method] = (methods[method] || 0) + 1;
        }
        console.log('\nExtraction methods used:');
        for (const [method, count] of Object.entries(methods)) {
            console.log(`  ${method}: ${count}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);

        // Try to get table names
        console.log('\n📋 Attempting to list available tables...');
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            console.log('Response:', await response.text());
        } catch (e) {
            console.log('Could not list tables');
        }
    }
}

analyzeResults().catch(console.error);
