/**
 * Centralized Event Extraction Prompts for Gemini AI
 * 
 * This module provides a single source of truth for all extraction prompts,
 * ensuring consistency across edge functions and scripts.
 * 
 * @version 2.0.0
 */

export const PROMPT_VERSION = '2.5.0'; // Added expired weekend, venue inference, series detection, door/show time, age/dress code

// ============================================================
// SHARED CONTEXT HELPERS
// ============================================================

/**
 * Get current date context for prompts (Philippine timezone UTC+8)
 */
export function getDateContext(): { today: string; currentYear: number; philippineTime: Date } {
    const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return {
        today: philippineTime.toISOString().split('T')[0],
        currentYear: philippineTime.getUTCFullYear(),
        philippineTime,
    };
}

/**
 * Calculate post date for relative date resolution
 */
export function getPostDateContext(postTimestamp?: string | null): string | null {
    return postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
}

// ============================================================
// PROMPT SECTIONS - Modular components for building prompts
// ============================================================

export const promptSections = {
    /**
     * Data source priority rules - CRITICAL for accuracy
     */
    dataSourcePriority: `
=== DATA SOURCE PRIORITY (CRITICAL) ===
1. POSTER/IMAGE TEXT - Most authoritative for dates, times, venues, prices
2. CAPTION TEXT - Secondary, often promotional
3. NEVER MAKE UP DETAILS - If not found, set to null
   - If date not visible → eventDate: null
   - If time not visible → eventTime: null
   - If price not visible → price: null
   - If venue not visible → locationName: null

=== RETROSPECTIVE POST DETECTION (CRITICAL - v2.4) ===
🚨 REJECT these as NOT events (isEvent: false):
- "Thank you for coming" / "Salamat sa lahat" / "See you at the next one"
- "What a night!" / "Last night was amazing" / "That was incredible"
- "Still riding the high from..." / "Pop-up was a blast"
- Caption in PAST TENSE describing what happened (not announcing)
- "We had so much fun" / "Until next time!"

These are POST-EVENT RECAPS, not future event announcements.
→ Set isEvent: false
→ rejectionReason: "post_event_recap"

=== GENERIC PROMO DETECTION (NEW - v2.4) ===
🚨 REJECT these as NOT events:
- "Hold your celebrations at [venue]" → generic promo, no specific event
- "Visit us anytime!" / "Come check us out"
- No specific date, time, or event name
→ Set isEvent: false
→ rejectionReason: "generic_promo"

=== TITLE EXTRACTION RULES ===
- PREFER the specific "Market Name" or "Artist/Event Name" from stylized text.
- EXCLUDE generic/instructional text: "Final Reminders", "Checklist", "See you there", "Pop-up", "Coming soon".
- If stylized text is unavailable, use the first 50 chars of caption but remove common promo words.

=== ARTIST & LINEUP RULES ===
- IDENTIFY performers, DJs, or guest speakers.
- LOOK FOR words like "featuring", "with", "selectors", "heavy hitters", or lists of handles.
- EXCLUDE the venue name from the artist list.
- CLEAN handles: "@artist_name" → "Artist Name".

=== SUB-EVENT DETECTION ===
- Some posts list multiple events (e.g., a "Class Showcase" AND an "Art Mart").
- If multiple distinct events are listed for the same date/venue, extract them as sub-events.
- Primary eventTitle should be the main "umbrella" title if it exists.

When sources conflict → PREFER image/poster text
`,

    /**
     * Date extraction rules with Filipino support
     */
    dateExtractionRules: (today: string, currentYear: number, postDate: string | null) => `
=== DATE EXTRACTION (CRITICAL) ===
${postDate ? `⚠️ POST DATE: ${postDate} ← USE THIS FOR RELATIVE WORDS` : ''}
TODAY (processing date): ${today} ← DO NOT use for "tonight/today/ngayon"

🚨 RELATIVE DATE WORDS - CRITICAL RULE 🚨
When caption contains: "tonight", "today", "ngayon", "mamaya", "tomorrow", "bukas"
→ Calculate date from POST DATE (${postDate || 'unknown'}), NOT from today (${today})!

🚨 EXPIRED RELATIVE DATES (NEW - v2.5) 🚨
If caption says "this weekend", "this Saturday", "tonight", "today":
- Calculate the intended date from POST DATE
- If that date is MORE THAN 3 DAYS before TODAY (${today}):
  → isEvent: false
  → rejectionReason: "relative_date_expired"
  → reasoning: "Post from ${postDate || 'unknown'} says 'this weekend' but that weekend has passed"

EXAMPLES (if post date is ${postDate || '2025-12-14'}):
- "See you tonight!" → eventDate: ${postDate || '2025-12-14'} (NOT ${today})
- "Join us today" → eventDate: ${postDate || '2025-12-14'} (NOT ${today})
- "Happening tomorrow" → eventDate: day after ${postDate || '2025-12-14'}
- "Ngayon lang!" → eventDate: ${postDate || '2025-12-14'}

FORMAT RULES (Filipino/European = day first):
- "05.12.2025" = December 5, 2025 (NOT May 12)
- "12/05" in December = December 12

EXTRACTION PRIORITY:
1. EXPLICIT date in image/caption: "Nov 29", "December 7", "DEC 04"
2. RELATIVE words → calculate from POST DATE${postDate ? ` (${postDate})` : ''}:
   - "tonight"/"today"/"ngayon"/"mamaya" = ${postDate || 'POST DATE'}
   - "tomorrow"/"bukas" = POST DATE + 1 day
   - "this weekend" = next Sat/Sun from POST DATE

YEAR INFERENCE:
- Past month/day → assume next year
- "Jan 5" in December ${currentYear} → January 5, ${currentYear + 1}

MULTI-DAY EVENTS:
- "Dec 6-7" → eventDate: first date, eventEndDate: last date
- If end time < start time → event crosses midnight, adjust eventEndDate

🚨 ONGOING EVENTS (CRITICAL Logic) 🚨
If POST DATE (${postDate || 'unknown'}) is BETWEEN eventDate and eventEndDate (inclusive):
- The event is STILL ACTIVE. Set isEvent: true.
- Do NOT reject as a "past event" just because it started yesterday.
- Only reject as past if POST DATE is strictly AFTER eventEndDate (or eventDate if not multi-day).
`,

    /**
     * Time extraction rules with AM/PM inference
     */
    timeExtractionRules: `
=== TIME EXTRACTION ===
Convert to 24-hour format (HH:MM:SS)

PATTERNS:
- "7PM" / "7:00 PM" → 19:00:00
- "19h30" → 19:30:00
- "alas-7 ng gabi" → 19:00:00 (Filipino evening)

CONTEXT-BASED AM/PM INFERENCE:
- Club/bar/party/concert (single digit) → PM
- Market/fair/yoga/run (morning activities) → AM
- "gabi" = evening (PM), "umaga" = morning (AM)
- "tanghali" = noon (~12:00), "hapon" = afternoon (PM)

=== DOOR TIME vs SHOW TIME (NEW - v2.5) ===
If poster shows separate times:
- "Doors: 7PM / Show: 9PM" or "Gates open: 6PM / Starts: 8PM"
- eventTime = doors/gates time (when venue opens)
- showTime = actual performance/event start time
- If only one time given, use as eventTime

MIDNIGHT CROSSING:
- If end time < start time (e.g., 10PM - 2AM) → event crosses midnight.
- MUST set eventEndDate = eventDate + 1 day (unless eventEndDate is already later).
- Examples: 
  * "10PM - 4AM" on Dec 7 → endTime: 04:00, eventEndDate: Dec 8
`,

    /**
     * Venue extraction rules
     */
    venueExtractionRules: `
=== VENUE EXTRACTION ===
PRIORITY ORDER:
1. Physical address from image (e.g., "5857 Alfonso, Poblacion")
2. Venue name from image (e.g., "Red Room", "Radius")
3. 📍 emoji followed by location
4. "at [Place]" or "sa [Place]" patterns
5. Instagram location tag
6. @venue_handle that matches venue patterns (NEW - v2.5)

EXTRACTION RULES:
- Extract ONLY venue name, stop at dates/times/hashtags
- CLEAN HANDLES: "@radius_katipunan" → "Radius Katipunan" (Strip '@', replace '_' and '.' with spaces, Title Case)
- Split venue and address when possible

=== VENUE INFERENCE FROM @MENTIONS (NEW - v2.5) ===
If explicit venue not found, check @mentions for venue patterns:
- @handles containing: bar, cafe, club, gallery, space, room, lounge, studio
- @handles that are clearly venue names (e.g., @electricsala, @oddcafe)
- Use with locationStatus: 'inferred'
- Add to reasoning: "Venue inferred from @mention"

DO NOT USE AS VENUE:
- @mentions of people/DJs/artists (usually have personal names)
- Words after "with"/"featuring" (performers)
- Account username
- @handles that are clearly people (@dj_name, @artist_name)
`,

    /**
     * Price extraction rules with Filipino currency
     */
    priceExtractionRules: `
=== PRICE EXTRACTION ===
FORMATS:
- "₱500" / "P500" / "Php500" / "PHP 500" → 500
- "500 pesos" → 500
- "₱300-500" → priceMin: 300, priceMax: 500
- "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, priceNotes: "GA ₱500, VIP ₱1500"

=== FREE DETECTION (IMPROVED - v2.5) ===
FREE ENTRY (isFree: true):
- "FREE ENTRY" / "FREE ADMISSION" / "No cover charge"
- "LIBRE" / "Walang bayad" / "Free entrance"

NOT FREE ENTRY (isFree: false):
- "FREE beer" / "FREE merch" / "FREE drink" → freebies at event, not free entry
- "FREE for first 50" → conditional, set isFree: false, priceNotes: "Free for first 50"

VALIDATION:
- Philippine events typically ₱100-₱5000
- Phone numbers (09XXXXXXXXX) are NOT prices
`,

    /**
     * NOT an event criteria - Single source of truth
     */
    notAnEventCriteria: (today: string) => `
=== NOT AN EVENT (isEvent: false) ===

1. RETROSPECTIVE/RECAP POSTS (rejectionReason: "post_event_recap"):
   - "Thank you for coming" / "Salamat sa lahat"
   - "What a night!" / "Last night was amazing"
   - "Still riding the high from..." / "Pop-up was a blast"
   - "We had so much fun" / "Until next time!"
   - Caption describes PAST event without future dates

2. GENERIC PROMOS (rejectionReason: "generic_promo"):
   - "Hold your celebrations at [venue]"
   - "Visit us anytime!" / "Come check us out"
   - No specific date, time, or event name
   - General venue promotion without event details

3. OPERATING HOURS (rejectionReason: "operating_hours"):
   - "6PM — Tues to Sat", "Open Mon-Fri", "Daily 10AM-10PM"

4. RECURRING WITHOUT DATE (rejectionReason: "generic_recurring"):
   - "Every Friday" without specific date

5. RATE SHEETS/MENUS (rejectionReason: "menu_price_list"):
   - Price lists for services, not event tickets

6. TEASERS (rejectionReason: "teaser"):
   - "Coming soon", "TBA", "Watch this space"

7. PAST EVENTS (rejectionReason: "past_event"):
   - Single day: date strictly before ${today}
   - Multi-day: eventEndDate strictly before ${today}

8. GIVEAWAYS (rejectionReason: "giveaway"):
   - "GIVEAWAY", "win a", "tag 2 friends"

9. VENDOR CALLS (rejectionReason: "vendor_call"):
   - "calling all vendors", "booth rental"
`,

    /**
     * Recurring event detection
     */
    recurringEventRules: (today: string) => `
=== RECURRING EVENTS ===
MARK isRecurring: true ONLY with explicit patterns:
- "Every Friday" → recurrence_pattern: "weekly:friday"
- "Monthly" / "First Saturday of every month"

NOT RECURRING:
- Multi-day: "Dec 6-7", "Friday & Saturday" → isRecurring: false
- One-time weekend: "This weekend" → isRecurring: false
- Specific date: "This Friday Dec 6" → isRecurring: false

For recurring, eventDate = next occurrence from ${today}
`,

    /**
     * Availability and update detection
     */
    availabilityAndUpdates: `
=== AVAILABILITY STATUS ===
- "SOLD OUT" / "fully booked" → availabilityStatus: 'sold_out'
- "waitlist only" → availabilityStatus: 'waitlist'
- "limited slots" / "few tickets left" → availabilityStatus: 'limited'

=== EVENT UPDATES ===
- "RESCHEDULED" / "MOVED TO" → isUpdate: true, updateType: 'reschedule'
- "CANCELLED" / "POSTPONED" → isUpdate: true, updateType: 'cancel'
- Weather mention + date change → reason: 'weather'

=== LOCATION STATUS ===
- "secret location" → locationStatus: 'secret'
- "location TBA" → locationStatus: 'tba'
- "DM for address" → locationStatus: 'dm_for_details'

=== EVENT SERIES DETECTION (NEW - v2.5) ===
If title contains ordinal or edition number:
- "Vol. 2", "Part 3", "Year 5", "2nd Anniversary", "Edition 4"
- Extract: seriesName (base name), seriesNumber (numeric)
- Examples:
  * "Sala Sessions Vol. 2" → seriesName: "Sala Sessions", seriesNumber: 2
  * "Wet Market's 2nd Anniversary" → seriesName: "Wet Market", seriesNumber: 2

=== AGE RESTRICTION (NEW - v2.5) ===
Look for age requirements:
- "18+", "21+", "Strictly 18 and above"
- "With valid ID", "ID required"
→ Extract to ageRestriction: "18+" or "21+" or null

=== DRESS CODE (NEW - v2.5) ===
Look for attire requirements:
- "Smart casual", "All black", "No slippers", "White party"
- "Formal attire", "Dress to impress"
→ Extract to dressCode: string or null
`,

    /**
     * Filipino language reference
     */
    filipinoLanguage: `
=== FILIPINO LANGUAGE ===
DATES: bukas=tomorrow, mamaya=later today, ngayon=today
DAYS: Lunes=Mon, Martes=Tue, Miyerkules=Wed, Huwebes=Thu, Biyernes=Fri, Sabado=Sat, Linggo=Sun
TIME: tanghali=noon, hapon=afternoon, gabi=evening, umaga=morning
MONTHS: Enero, Pebrero, Marso, Abril, Mayo, Hunyo, Hulyo, Agosto, Setyembre, Oktubre, Nobyembre, Disyembre
`,

    /**
     * Category classification with examples
     */
    categoryClassification: `
=== CATEGORY (use EXACT values) ===
- nightlife: clubs, bars, DJ sets, parties → "Freaky Friday at Club X"
- music: concerts, gigs, live bands → "Album Launch: Artist Live"
- art_culture: galleries, theater, exhibits → "Art Exhibition Opening"
- markets: bazaars, pop-ups, flea markets, thrift sales → "Christmas Bazaar 2025"
- food: food festivals, tastings → "Ramen Pop-up Event"
- workshops: classes, seminars → "Photography Workshop"
- community: meetups, fundraisers → "Volunteer Day"
- comedy: stand-up, improv → "Comedy Night"
- other: anything else
`,

    /**
     * Confidence scoring guidelines
     */
    confidenceScoring: `
=== CONFIDENCE SCORING ===
- 0.90-1.00: ALL core fields visible in BOTH image AND caption
- 0.80-0.89: Fields clear in ONE source, minor inference needed
- 0.60-0.79: Some interpretation required (date format, time inference)
- 0.40-0.59: Multiple fields inferred
- < 0.40: High uncertainty → set uncertain fields to null instead
`,
};

// ============================================================
// PROMPT BUILDERS - Compose sections into complete prompts
// ============================================================

export interface PromptOptions {
    caption: string;
    hasImage: boolean;
    postTimestamp?: string | null;
    ocrText?: string | null;
    ocrLines?: string[];
    knownVenues?: Array<{ name: string; aliases?: string[]; address?: string | null }>;
    similarCorrections?: Array<{ original: string; corrected: string; field?: string }>;
    accountUsualVenues?: Array<{ venue: string; frequency: number }>;
    ownerUsername?: string | null;
    locationHint?: string | null;
}

/**
 * Build the complete extraction prompt with all context
 */
export function buildExtractionPrompt(options: PromptOptions): string {
    const { today, currentYear } = getDateContext();
    const postDate = getPostDateContext(options.postTimestamp);

    // Clean caption
    const cleanedCaption = options.caption
        .replace(/#[\w]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let prompt = `You are an expert at extracting event information from Filipino Instagram posts.
PROMPT VERSION: ${PROMPT_VERSION}

TODAY: ${today}
${postDate ? `POST DATE: ${postDate}` : ''}

${promptSections.dataSourcePriority}
`;

    // Add OCR text if available
    if (options.ocrText && options.ocrLines && options.ocrLines.length > 0) {
        prompt += `
=== TEXT FROM IMAGE (OCR) ===
"""
${options.ocrText}
"""

Lines: ${options.ocrLines.slice(0, 20).map((line, i) => `${i + 1}. ${line}`).join('\n')}

IMPORTANT: Image text often has real event details. Caption is often promotional.
`;
    }

    // Add caption
    prompt += `
=== INSTAGRAM CAPTION ===
"""
${cleanedCaption || '(No caption)'}
"""

${options.locationHint ? `LOCATION TAG: ${options.locationHint}` : ''}
${options.ownerUsername ? `POSTED BY: @${options.ownerUsername}` : ''}
`;

    // Add smart context
    if (options.similarCorrections && options.similarCorrections.length > 0) {
        prompt += `
=== PAST CORRECTIONS (learn from these) ===
${options.similarCorrections.slice(0, 10).map(c => `- "${c.original}" → "${c.corrected}"${c.field ? ` (${c.field})` : ''}`).join('\n')}
`;
    }

    if (options.knownVenues && options.knownVenues.length > 0) {
        prompt += `
=== KNOWN VENUES (use exact names) ===
${options.knownVenues.slice(0, 15).map(v => `- "${v.name}"${v.aliases?.length ? ` (aliases: ${v.aliases.join(', ')})` : ''}`).join('\n')}
`;
    }

    if (options.accountUsualVenues && options.accountUsualVenues.length > 0) {
        prompt += `
=== THIS ACCOUNT'S USUAL VENUES ===
${options.accountUsualVenues.slice(0, 5).map(v => `- ${v.venue} (${v.frequency} posts)`).join('\n')}
`;
    }

    // Add extraction rules (condensed)
    prompt += `
${promptSections.dateExtractionRules(today, currentYear, postDate)}
${promptSections.timeExtractionRules}
${promptSections.venueExtractionRules}
${promptSections.priceExtractionRules}
${promptSections.notAnEventCriteria(today)}
${promptSections.recurringEventRules(today)}
${promptSections.availabilityAndUpdates}
${promptSections.categoryClassification}
${promptSections.filipinoLanguage}
${promptSections.confidenceScoring}
`;

    // Add output format
    prompt += `
=== OUTPUT FORMAT (JSON only, no markdown) ===
{
  "eventTitle": "string or null",
  "eventDate": "YYYY-MM-DD or null",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS or null",
  "endTime": "HH:MM:SS or null",
  "locationName": "venue name only or null",
  "locationAddress": "full address or null",
  "price": number or null,
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": "string or null",
  "isFree": boolean or null,
  "signupUrl": "URL or null",
  "isEvent": boolean,
  "rejectionReason": "post_event_recap|generic_promo|operating_hours|past_event|teaser|giveaway|vendor_call or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "category": "nightlife|music|art_culture|markets|food|workshops|community|comedy|other",
  "isRecurring": boolean,
  "recurrencePattern": "weekly:friday or null",
  "isUpdate": boolean,
  "updateType": "reschedule|cancel|venue_change|time_change or null",
  "originalDate": "YYYY-MM-DD or null",
  "reason": "string or null",
  "availabilityStatus": "available|sold_out|waitlist|limited|few_left or null",
  "locationStatus": "confirmed|tba|secret|dm_for_details|inferred or null",
  "artists": ["string"],
  "subEvents": [
    {
      "title": "string",
      "time": "HH:MM:SS or null",
      "description": "string or null"
    }
  ],
  "showTime": "HH:MM:SS or null (actual performance time if different from doors)",
  "seriesName": "string or null (e.g., 'Sala Sessions')",
  "seriesNumber": "number or null (e.g., 2 for Vol. 2)",
  "ageRestriction": "18+|21+ or null",
  "dressCode": "string or null"
}`;

    return prompt;
}

/**
 * Build a shorter prompt for vision-only extraction (image + caption)
 */
export function buildVisionPrompt(options: PromptOptions): string {
    const { today, currentYear } = getDateContext();
    const postDate = getPostDateContext(options.postTimestamp);

    const cleanedCaption = options.caption
        .replace(/#[\w]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let prompt = `You are an expert at extracting event information from Filipino Instagram event posters.
PROMPT VERSION: ${PROMPT_VERSION}

TODAY: ${today}
${postDate ? `POST DATE: ${postDate}` : ''}

${promptSections.dataSourcePriority}

CAPTION:
"""
${cleanedCaption || '(No caption)'}
"""

The attached image is an event poster. Extract ALL event details from the image.

${promptSections.dateExtractionRules(today, currentYear, postDate)}
${promptSections.timeExtractionRules}
${promptSections.venueExtractionRules}
${promptSections.priceExtractionRules}
${promptSections.notAnEventCriteria(today)}
${promptSections.filipinoLanguage}
${promptSections.confidenceScoring}
`;

    // Add context if available
    if (options.knownVenues && options.knownVenues.length > 0) {
        prompt += `
KNOWN VENUES: ${options.knownVenues.slice(0, 10).map(v => v.name).join(', ')}
`;
    }

    prompt += `
Return ONLY valid JSON (no markdown):
{
  "eventTitle": "string or null",
  "eventDate": "YYYY-MM-DD or null",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS or null",
  "endTime": "HH:MM:SS or null",
  "locationName": "string or null",
  "locationAddress": "string or null",
  "price": number or null,
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": "string or null",
  "isFree": boolean,
  "signupUrl": "string or null",
  "isEvent": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "what you found in the image",
  "isUpdate": boolean,
  "updateType": "reschedule|cancel|venue_change|time_change or null",
  "availabilityStatus": "available|sold_out|waitlist|limited|few_left or null",
  "locationStatus": "confirmed|tba|secret|dm_for_details or null",
  "artists": ["string"],
  "subEvents": [
    {
      "title": "string",
      "time": "HH:MM:SS or null",
      "description": "string or null"
    }
  ]
}`;

    return prompt;
}

// ============================================================
// OCR PROMPT BUILDER
// ============================================================

export interface OCRPromptOptions extends PromptOptions {
    ocrText: string;
    ocrLines?: string[];
}

/**
 * Build extraction prompt that includes OCR text from image
 * Used when we have pre-extracted text from poster images
 */
export function buildOCRPrompt(options: OCRPromptOptions): string {
    const { today, currentYear } = getDateContext();
    const postDate = getPostDateContext(options.postTimestamp);

    let prompt = `You are an expert at extracting event information from Filipino Instagram posts.
PROMPT VERSION: ${PROMPT_VERSION}
TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

${promptSections.dataSourcePriority}

=== TEXT EXTRACTED FROM POSTER (OCR) ===
"""
${options.ocrText || '(No OCR text available)'}
"""

=== CAPTION TEXT ===
"""
${options.caption || '(No caption provided)'}
"""

${options.locationHint ? `INSTAGRAM LOCATION TAG: ${options.locationHint}` : ''}
${options.ownerUsername ? `POSTED BY: @${options.ownerUsername}` : ''}

${promptSections.dateExtractionRules(today, currentYear, postDate)}
${promptSections.timeExtractionRules}
${promptSections.venueExtractionRules}
${promptSections.priceExtractionRules}
${promptSections.notAnEventCriteria(today)}
${promptSections.filipinoLanguage}
${promptSections.confidenceScoring}
`;

    // Add context sections
    if (options.similarCorrections && options.similarCorrections.length > 0) {
        prompt += `
PAST CORRECTIONS: ${options.similarCorrections.slice(0, 5).map(c => `"${c.original}" → "${c.corrected}"`).join(', ')}
`;
    }

    if (options.knownVenues && options.knownVenues.length > 0) {
        prompt += `
KNOWN VENUES: ${options.knownVenues.slice(0, 10).map(v => v.name).join(', ')}
`;
    }

    if (options.accountUsualVenues && options.accountUsualVenues.length > 0) {
        prompt += `
THIS ACCOUNT'S USUAL VENUES: ${options.accountUsualVenues.slice(0, 5).map(v => `${v.venue} (${v.frequency}x)`).join(', ')}
`;
    }

    prompt += `
${promptSections.categoryClassification}

Return ONLY valid JSON (no markdown):
{
  "eventTitle": "string or null",
  "eventDate": "YYYY-MM-DD or null",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS or null",
  "endTime": "HH:MM:SS or null",
  "locationName": "string or null",
  "locationAddress": "string or null",
  "price": number or null,
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": "string or null",
  "isFree": boolean,
  "signupUrl": "string or null",
  "isEvent": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "isUpdate": boolean,
  "updateType": "reschedule|cancel|venue_change|time_change or null",
  "availabilityStatus": "available|sold_out|waitlist|limited|few_left or null",
  "locationStatus": "confirmed|tba|secret|dm_for_details or null",
  "category": "nightlife|music|art_culture|markets|food|workshops|community|comedy|other",
  "isRecurring": boolean,
  "recurrencePattern": "string or null",
  "artists": ["string"],
  "subEvents": [
    {
      "title": "string",
      "time": "HH:MM:SS or null",
      "description": "string or null"
    }
  ]
}
`;

    return prompt;
}

// Types are exported with the interface definition above
