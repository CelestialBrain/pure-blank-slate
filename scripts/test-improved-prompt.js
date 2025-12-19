/**
 * Test Script: Compare original vs improved extraction prompts
 * 
 * This script takes posts with missing fields and tests them against
 * the improved prompt to see if extraction improves.
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
    'https://azdcshjzkcidqmkpxuqz.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// IMPROVED PROMPT SECTIONS (v2.4.0)
// ============================================================

const IMPROVED_PROMPT_VERSION = '2.4.0';

function getDateContext() {
    const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return {
        today: philippineTime.toISOString().split('T')[0],
        currentYear: philippineTime.getUTCFullYear(),
    };
}

const improvedPromptSections = {
    // NEW: Explicit retrospective detection
    retrospectiveDetection: `
=== RETROSPECTIVE POST DETECTION (NEW - CRITICAL) ===
🚨 REJECT these as NOT events (isEvent: false):
- "Thank you for coming" / "Salamat sa lahat" / "See you at the next one"
- "What a night!" / "Last night was amazing" / "That was incredible"
- "Pop-up was a blast" / "We had so much fun"
- Caption in PAST TENSE describing what happened (not announcing)

These are POST-EVENT RECAPS, not future event announcements.
→ Set rejectionReason: "post_event_recap"
`,

    // IMPROVED: Stricter relative date handling
    improvedDateRules: (today, currentYear, postDate) => `
=== DATE EXTRACTION (IMPROVED v2.4) ===
POST DATE: ${postDate || 'unknown'}
TODAY: ${today}

🚨 EXPIRED RELATIVE DATES - CRITICAL 🚨
If caption contains "today", "tonight", "ngayon", "mamaya":
- Calculate the intended date from POST DATE (${postDate})
- If that date is MORE THAN 2 DAYS before TODAY (${today}):
  → The event already happened
  → Set isEvent: false
  → rejectionReason: "relative_date_expired"
  → reasoning: "Post from ${postDate} says 'tonight' - event already passed"

🚨 "THIS WEEKEND" HANDLING 🚨
- Calculate weekend from POST DATE, not from today
- If POST DATE's weekend is in the past → isEvent: false

FORMAT RULES:
- Filipino/European format: day comes first
- "05.12.2025" = December 5, 2025 (NOT May 12)

EXPLICIT DATE PRIORITY:
1. Dates in image text: "DEC 20", "December 20", "12/20"
2. Dates in caption
3. Relative words → calculate from POST DATE

MULTI-DAY EVENTS:
- "Dec 6-7" → eventDate: 2025-12-06, eventEndDate: 2025-12-07
- "Dec 6-Jan 4" → cross-year, extract both dates correctly

YEAR INFERENCE:
- If month already passed this year → next year
- "Jan 5" in December 2025 → January 5, 2026
`,

    // IMPROVED: Better venue inference
    improvedVenueRules: `
=== VENUE EXTRACTION (IMPROVED) ===
PRIORITY ORDER:
1. Physical address from image
2. Venue name from image  
3. 📍 emoji + location
4. "at [Place]" / "sa [Place]"
5. Instagram location tag
6. @venue_handle in caption (if clearly a venue, not a person)

VENUE INFERENCE:
- If venue cannot be found but account historically posts about same venue:
  → Use that venue with locationStatus: 'inferred'
  → Add to reasoning: "Venue inferred from account history"

HANDLE CLEANING:
- "@radius_katipunan" → "Radius Katipunan"
- "@electricsala" → "Electric Sala"

DO NOT USE AS VENUE:
- @mentions of people/DJs/artists
- Words after "with"/"featuring" (performers)
- Generic terms like "Manila" or "BGC" alone
`,

    // IMPROVED: Better "not an event" criteria
    improvedNotAnEvent: (today) => `
=== NOT AN EVENT (STRICT CRITERIA) ===
Set isEvent: false for:

1. RETROSPECTIVE POSTS:
   - "Thank you" / "Salamat" recap posts
   - Past tense descriptions without future dates
   - "What a night!" type celebrations

2. EXPIRED RELATIVE DATES:
   - "Tonight!" but post is 3+ days old
   - "This weekend" but that weekend passed

3. OPERATING HOURS (not events):
   - "Open Mon-Fri 10AM-10PM"
   - "Daily: 6PM onwards"

4. GENERIC PROMOS:
   - "Visit us anytime!"
   - "Come check us out"
   - No specific date/time

5. TEASERS:
   - "Coming soon" / "TBA" / "Stay tuned"

6. VENDOR CALLS:
   - "Calling all vendors"
   - "Booth applications open"

7. PAST SINGLE-DAY EVENTS:
   - Event date strictly before ${today}

8. PAST MULTI-DAY EVENTS:
   - eventEndDate strictly before ${today}
`,

    // NEW: Event status field
    eventStatusRules: `
=== EVENT STATUS ===
Determine the status based on dates:
- "upcoming": eventDate is in the future
- "ongoing": today is between eventDate and eventEndDate
- "concluded": all dates are in the past (but set isEvent: false for these)
`,
};

// Build the improved test prompt
function buildImprovedPrompt(caption, postDate, knownVenues = []) {
    const { today, currentYear } = getDateContext();

    const cleanedCaption = caption
        .replace(/#[\w]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return `You are an expert at extracting event information from Filipino Instagram posts.
PROMPT VERSION: ${IMPROVED_PROMPT_VERSION} (TEST)

TODAY: ${today}
POST DATE: ${postDate}

=== DATA SOURCE PRIORITY ===
1. POSTER/IMAGE TEXT - Most authoritative
2. CAPTION TEXT - Secondary
3. NEVER MAKE UP DETAILS - If not found, set to null

${improvedPromptSections.retrospectiveDetection}

=== INSTAGRAM CAPTION ===
"""
${cleanedCaption || '(No caption)'}
"""

${knownVenues.length > 0 ? `KNOWN VENUES: ${knownVenues.join(', ')}` : ''}

${improvedPromptSections.improvedDateRules(today, currentYear, postDate)}
${improvedPromptSections.improvedVenueRules}
${improvedPromptSections.improvedNotAnEvent(today)}
${improvedPromptSections.eventStatusRules}

=== CATEGORY ===
- nightlife: clubs, bars, DJ sets, parties
- music: concerts, gigs, live bands
- art_culture: galleries, theater, exhibits
- markets: bazaars, pop-ups, flea markets
- food: food festivals, tastings
- workshops: classes, seminars
- community: meetups, fundraisers
- comedy: stand-up, improv
- other: anything else

Return ONLY valid JSON (no markdown):
{
  "eventTitle": "string or null",
  "eventDate": "YYYY-MM-DD or null",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS or null",
  "endTime": "HH:MM:SS or null",
  "locationName": "string or null",
  "locationAddress": "string or null",
  "price": "number or null",
  "isFree": "boolean or null",
  "isEvent": "boolean",
  "confidence": "0.0-1.0",
  "reasoning": "brief explanation",
  "rejectionReason": "string or null (e.g., post_event_recap, relative_date_expired)",
  "category": "nightlife|music|art_culture|markets|food|workshops|community|comedy|other",
  "eventStatus": "upcoming|ongoing|concluded or null",
  "locationStatus": "confirmed|inferred|tba|secret or null"
}`;
}

async function testPrompt() {
    console.log('='.repeat(80));
    console.log('TESTING IMPROVED PROMPT v2.4.0');
    console.log('='.repeat(80));

    // Get problematic posts (missing date or venue, marked as event)
    const { data: posts, error } = await supabase
        .from('instagram_posts')
        .select('id, post_id, caption, posted_at, is_event, event_title, event_date, location_name, ai_reasoning')
        .eq('is_event', true)
        .or('event_date.is.null,location_name.is.null')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.log('Error fetching posts:', error.message);
        return;
    }

    console.log(`\nFound ${posts.length} problematic posts to test\n`);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let improved = 0;
    let sameOrWorse = 0;
    let correctlyRejected = 0;

    for (const post of posts) {
        console.log('-'.repeat(80));
        console.log(`Post: ${post.post_id}`);
        console.log(`Caption: ${(post.caption || '').substring(0, 150)}...`);
        console.log(`Post Date: ${post.posted_at}`);
        console.log(`\nCURRENT EXTRACTION:`);
        console.log(`  Title: ${post.event_title || 'MISSING'}`);
        console.log(`  Date: ${post.event_date || 'MISSING'}`);
        console.log(`  Venue: ${post.location_name || 'MISSING'}`);

        // Run through improved prompt
        const postDate = post.posted_at ? new Date(post.posted_at).toISOString().split('T')[0] : null;
        const prompt = buildImprovedPrompt(post.caption || '', postDate);

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Parse JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const extracted = JSON.parse(jsonMatch[0]);

                console.log(`\nIMPROVED EXTRACTION:`);
                console.log(`  isEvent: ${extracted.isEvent}`);
                console.log(`  Title: ${extracted.eventTitle || 'null'}`);
                console.log(`  Date: ${extracted.eventDate || 'null'}`);
                console.log(`  Venue: ${extracted.locationName || 'null'}`);
                console.log(`  Status: ${extracted.eventStatus || 'null'}`);
                console.log(`  Rejection: ${extracted.rejectionReason || 'none'}`);
                console.log(`  Reasoning: ${extracted.reasoning}`);

                // Analyze improvement
                if (!extracted.isEvent && extracted.rejectionReason) {
                    console.log(`  ✅ CORRECTLY REJECTED as ${extracted.rejectionReason}`);
                    correctlyRejected++;
                } else if (extracted.eventDate && !post.event_date) {
                    console.log(`  ✅ IMPROVED: Found date`);
                    improved++;
                } else if (extracted.locationName && !post.location_name) {
                    console.log(`  ✅ IMPROVED: Found venue`);
                    improved++;
                } else {
                    console.log(`  ⚪ Same or no improvement`);
                    sameOrWorse++;
                }
            }
        } catch (err) {
            console.log(`  ❌ Error: ${err.message}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total tested: ${posts.length}`);
    console.log(`Correctly rejected (retrospective): ${correctlyRejected}`);
    console.log(`Improved (found missing data): ${improved}`);
    console.log(`Same or no improvement: ${sameOrWorse}`);
    console.log(`Success rate: ${Math.round((correctlyRejected + improved) / posts.length * 100)}%`);
}

testPrompt().catch(console.error);
