/**
 * AI-Powered Event Extraction using Google's Gemini API
 * 
 * This function intelligently extracts event information from Instagram captions,
 * handling Filipino/English mixed content, multi-venue events, and complex date formats.
 * 
 * Enhanced with Smart Context System to learn from past corrections and known venue data.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { buildAIContext, AIContext } from './contextBuilder.ts';
import {
  buildExtractionPrompt as buildCentralizedPrompt,
  buildVisionPrompt,
  buildOCRPrompt,
  PromptOptions,
  OCRPromptOptions
} from '../_shared/prompts/eventExtraction.ts';

// Caption length threshold - captions shorter than this may have details in image
const SHORT_CAPTION_THRESHOLD = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Additional date/venue information for multi-venue events
 */
interface AdditionalDate {
  date: string;
  venue: string;
  time?: string;
}

/**
 * AI extraction result structure
 */
interface AIExtractionResult {
  eventTitle: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventTime: string | null;
  endTime: string | null;
  locationName: string | null;
  locationAddress: string | null;
  isEvent: boolean;
  confidence: number;
  reasoning: string;
  additionalDates?: AdditionalDate[];
  isFree?: boolean | null;
  price?: number | null;
  signupUrl?: string;
  // OCR metadata (added when OCR extraction is used)
  ocrTextExtracted?: string[];
  ocrConfidence?: number;
  extractionMethod?: 'ai' | 'ocr_ai' | 'vision';
  sourceBreakdown?: {
    fromCaption: string[];
    fromImage: string[];
  };
  // Event update tracking fields
  isUpdate?: boolean;
  updateType?: 'reschedule' | 'cancel' | 'venue_change' | 'time_change' | null;
  originalDate?: string | null;
  reason?: string | null;
  // Availability status
  availabilityStatus?: 'available' | 'sold_out' | 'waitlist' | 'limited' | 'few_left';
  // Price range support
  priceMin?: number | null;
  priceMax?: number | null;
  priceNotes?: string | null;
  // Location status
  locationStatus?: 'confirmed' | 'tba' | 'secret' | 'dm_for_details';
}

/**
 * OCR extraction result from ocr-extract edge function
 */
interface OCRExtractResult {
  success: boolean;
  textLines: string[];
  fullText: string;
  confidence: number;
  error?: string;
}

// OCR confidence and text length thresholds for triggering vision fallback
const OCR_CONFIDENCE_THRESHOLD = 0.5;
const OCR_MIN_TEXT_LENGTH = 20;

// Timeout for image fetch in milliseconds
const IMAGE_FETCH_TIMEOUT_MS = 30000;

/**
 * Fetch an image and convert it to base64 encoding
 * Returns both the base64 data and the detected MIME type
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    // Detect MIME type from response headers, default to image/jpeg
    const contentType = response.headers.get('content-type');
    let mimeType = 'image/jpeg';
    if (contentType) {
      // Extract just the mime type, ignore charset etc
      const mimeMatch = contentType.match(/^(image\/[a-z]+)/i);
      if (mimeMatch) {
        mimeType = mimeMatch[1].toLowerCase();
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 using chunked approach for better memory efficiency
    const CHUNK_SIZE = 32768; // 32KB chunks
    let binary = '';
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
      binary += String.fromCharCode.apply(null, [...chunk]);
    }

    return { base64: btoa(binary), mimeType };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract event data using Gemini Vision API
 * This function sends the image directly to Gemini for visual understanding,
 * which is better at reading stylized/artistic text than OCR.
 */
async function extractWithGeminiVision(
  imageUrl: string,
  caption: string,
  context: AIContext,
  apiKey: string,
  postTimestamp?: string | null
): Promise<AIExtractionResult> {

  // Fetch image and convert to base64
  const { base64: base64Image, mimeType } = await fetchImageAsBase64(imageUrl);

  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];

  // Parse post timestamp for relative date calculations
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;

  const cleanedCaption = cleanCaptionForExtraction(caption);


  const prompt = buildVisionPrompt({
    caption: cleanedCaption,
    hasImage: true,
    postTimestamp: postTimestamp,
    knownVenues: context.knownVenues,
    similarCorrections: context.similarCorrections,
    accountUsualVenues: context.accountUsualVenues,
    ownerUsername: context.ownerUsername,
    locationHint: context.locationHint,
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Extract the text content from Gemini response
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini Vision response');
  }

  // Parse the JSON response
  // Clean up the response - remove markdown code blocks if present
  let jsonStr = textContent.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  // Extract JSON from response if there's extra text
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini Vision response');
  }

  const result = JSON.parse(jsonMatch[0]) as AIExtractionResult;

  // Validate required fields
  if (typeof result.isEvent !== 'boolean') {
    result.isEvent = false;
  }
  if (typeof result.confidence !== 'number') {
    result.confidence = 0.5;
  }
  if (!result.reasoning) {
    result.reasoning = 'Extracted using Gemini Vision';
  }

  result.extractionMethod = 'vision';

  return result;
}

/**
 * Clean caption by stripping hashtags before processing
 */
function cleanCaptionForExtraction(caption: string): string {
  // Remove hashtags but preserve the text for context
  const cleaned = caption
    // Replace hashtags with spaces to preserve word boundaries
    .replace(/#[\w]+/g, ' ')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Build the extraction prompt for Gemini with smart context
 * 
 * Now uses centralized prompts from _shared/prompts/eventExtraction.ts
 * for consistency across all extraction methods.
 */
function buildExtractionPrompt(
  context: AIContext,
  postTimestamp?: string | null
): string {
  // Use centralized prompt builder for consistency
  const promptOptions: PromptOptions = {
    caption: context.caption,
    hasImage: false,
    postTimestamp: postTimestamp || context.postedAt,
    knownVenues: context.knownVenues,
    similarCorrections: context.similarCorrections,
    accountUsualVenues: context.accountUsualVenues,
    ownerUsername: context.ownerUsername,
    locationHint: context.locationHint,
  };

  return buildCentralizedPrompt(promptOptions);
}

// Original buildExtractionPrompt content (~260 lines) moved to:
// supabase/functions/_shared/prompts/eventExtraction.ts
// 
// The original was kept as a legacy reference below but should be removed
// once the centralized module is verified to work correctly.

// --- LEGACY CODE REMOVED ---

/**
 * Build the extraction prompt with OCR text from image
 */
function buildPromptWithOCR(
  caption: string,
  ocrText: string,
  ocrLines: string[],
  context: AIContext,
  postTimestamp?: string | null
): string {
  // Use centralized OCR prompt builder
  const options: OCRPromptOptions = {
    caption,
    ocrText,
    ocrLines,
    hasImage: true,
    postTimestamp: postTimestamp || context.postedAt,
    knownVenues: context.knownVenues,
    similarCorrections: context.similarCorrections,
    accountUsualVenues: context.accountUsualVenues,
    ownerUsername: context.ownerUsername,
    locationHint: context.locationHint,
  };

  return buildOCRPrompt(options);
}


/**
 * Call OCR extraction edge function
 */
async function callOCRExtract(
  imageUrl: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<OCRExtractResult | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ocr-extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageUrl })
    });

    if (!response.ok) {
      console.error(`OCR extraction failed with status ${response.status}`);
      return null;
    }

    const result = await response.json() as OCRExtractResult;
    return result;
  } catch (error) {
    console.error('OCR extraction error:', error);
    return null;
  }
}

/**
 * Extract event with OCR assistance
 * This combines OCR text from image with caption text for AI analysis.
 * Falls back to Gemini Vision when OCR confidence is low or text extraction is minimal.
 */
async function extractWithOCRAndAI(
  caption: string,
  imageUrl: string,
  context: AIContext,
  supabaseUrl: string,
  supabaseKey: string,
  geminiApiKey: string,
  postTimestamp?: string | null
): Promise<AIExtractionResult> {

  // Step 1: Run OCR on image
  let ocrText = '';
  let ocrLines: string[] = [];
  let ocrConfidence = 0;

  const ocrResult = await callOCRExtract(imageUrl, supabaseUrl, supabaseKey);

  if (ocrResult && ocrResult.success) {
    ocrText = ocrResult.fullText;
    ocrLines = ocrResult.textLines;
    ocrConfidence = ocrResult.confidence;
    console.log(`OCR extracted ${ocrLines.length} lines with confidence ${ocrConfidence}`);
  } else {
    console.warn('OCR failed:', ocrResult?.error || 'Unknown error');
  }

  // Step 2: Check if OCR was successful enough
  const ocrSuccessful = ocrConfidence >= OCR_CONFIDENCE_THRESHOLD && ocrText.length >= OCR_MIN_TEXT_LENGTH;

  if (!ocrSuccessful && imageUrl) {
    // OCR struggled - fall back to Gemini Vision
    console.log(`OCR confidence too low (${ocrConfidence}) or text too short (${ocrText.length} chars). Using Gemini Vision.`);

    try {
      const visionResult = await extractWithGeminiVision(imageUrl, caption, context, geminiApiKey, postTimestamp);
      return {
        ...visionResult,
        extractionMethod: 'vision',
        ocrConfidence: ocrConfidence > 0 ? ocrConfidence : undefined, // Track that OCR was attempted
      };
    } catch (visionError) {
      console.warn('Gemini Vision failed, falling back to OCR+AI:', visionError);
      // Continue with OCR+AI as last resort
    }
  }

  // Step 3: Build enhanced prompt with OCR text (original flow)
  const combinedPrompt = buildPromptWithOCR(caption, ocrText, ocrLines, context, postTimestamp);

  // Step 4: Call Gemini with combined context
  const aiResult = await callGeminiAPI(combinedPrompt, geminiApiKey);

  // Step 5: Add OCR metadata
  return {
    ...aiResult,
    ocrTextExtracted: ocrLines.length > 0 ? ocrLines : undefined,
    ocrConfidence: ocrConfidence > 0 ? ocrConfidence : undefined,
    extractionMethod: ocrLines.length > 0 ? 'ocr_ai' : 'ai'
  };
}

/**
 * Call Gemini API for extraction
 */
async function callGeminiAPI(
  prompt: string,
  apiKey: string
): Promise<AIExtractionResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistent extraction
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Extract the text content from Gemini response
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  // Parse the JSON response
  try {
    // Clean up the response - remove markdown code blocks if present
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr) as AIExtractionResult;

    // Validate required fields
    if (typeof parsed.isEvent !== 'boolean') {
      parsed.isEvent = false;
    }
    if (typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.5;
    }
    if (!parsed.reasoning) {
      parsed.reasoning = 'No reasoning provided';
    }

    return parsed;
  } catch (parseError) {
    console.error('Failed to parse Gemini response:', textContent);
    throw new Error(`Failed to parse Gemini response: ${parseError}`);
  }
}

/**
 * Validate and clean the extraction result
 */
function validateExtractionResult(result: AIExtractionResult): AIExtractionResult {
  // Validate core fields presence and adjust confidence/isEvent accordingly
  const hasCoreFields = !!(result.eventTitle && result.eventDate && result.locationName);

  if (!hasCoreFields) {
    // Missing core fields - enforce strict confidence and isEvent rules
    if (!result.eventDate) {
      console.warn('Missing eventDate - marking as not an event');
      result.isEvent = false;
      result.confidence = Math.min(result.confidence, 0.5);
      result.reasoning = (result.reasoning || '') + ' | No specific date found, marked as non-event';
    } else if (!result.eventTitle || !result.locationName) {
      console.warn('Missing core fields (title or location) - lowering confidence');
      result.confidence = Math.min(result.confidence, 0.6);
    }
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (result.eventDate && !dateRegex.test(result.eventDate)) {
    result.eventDate = null;
    result.isEvent = false;
    result.confidence = Math.min(result.confidence, 0.5);
  }
  if (result.eventEndDate && !dateRegex.test(result.eventEndDate)) {
    result.eventEndDate = null;
  }

  // Validate time format (HH:MM:SS)
  const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
  if (result.eventTime && !timeRegex.test(result.eventTime)) {
    // Try to fix common time formats
    if (/^\d{2}:\d{2}$/.test(result.eventTime)) {
      result.eventTime = result.eventTime + ':00';
    } else {
      result.eventTime = null;
    }
  }
  if (result.endTime && !timeRegex.test(result.endTime)) {
    if (/^\d{2}:\d{2}$/.test(result.endTime)) {
      result.endTime = result.endTime + ':00';
    } else {
      result.endTime = null;
    }
  }

  // Validate time values
  if (result.eventTime) {
    const [hour, minute] = result.eventTime.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      result.eventTime = null;
    }
  }
  if (result.endTime) {
    const [hour, minute] = result.endTime.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      result.endTime = null;
    }
  }

  // Clean location name - strip any remaining dates, times, hashtags
  if (result.locationName) {
    let cleanLoc = result.locationName
      // Remove date patterns
      .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s*\d{1,2}(?:-\d{1,2})?,?\s*\d{0,4}/gi, '')
      // Remove time patterns
      .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
      // Remove hashtags
      .replace(/#[\w]+/g, '')
      // Remove sponsor text
      .replace(/\s*(?:Made possible by|Powered by|Sponsored by|Presented by|In partnership with):?.*$/i, '')
      // Remove @mentions
      .replace(/@[\w.]+/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Remove trailing punctuation
    cleanLoc = cleanLoc.replace(/[.,!?;:]+$/, '').trim();

    result.locationName = cleanLoc || null;
  }

  // Validate additionalDates
  if (result.additionalDates && Array.isArray(result.additionalDates)) {
    result.additionalDates = result.additionalDates.filter(ad => {
      if (!ad.date || !dateRegex.test(ad.date)) return false;
      if (!ad.venue) return false;
      if (ad.time && !timeRegex.test(ad.time)) {
        ad.time = undefined;
      }
      return true;
    });
    if (result.additionalDates.length === 0) {
      result.additionalDates = undefined;
    }
  }

  // Fix price/isFree contradiction
  if (result.price === 0 && result.isFree === false) {
    console.warn('Contradictory price data: price=0 but isFree=false, fixing to isFree=null');
    result.isFree = null;
  }

  // Validate price/isFree consistency
  if (result.isFree === true && result.price && result.price > 0) {
    console.warn(`Contradictory: isFree=true but price=${result.price}, setting price to null`);
    result.price = null;
    result.priceMin = null;
    result.priceMax = null;
  }

  if (result.isFree === false && (!result.price || result.price === 0)) {
    console.warn('isFree=false but no price found, setting isFree to null');
    result.isFree = null;
  }

  // Infer isFree from price presence
  if (result.price && result.price > 0 && result.isFree === null) {
    console.warn(`Price found (${result.price}) but isFree not set, inferring isFree=false`);
    result.isFree = false;
  }

  // Ensure confidence is in valid range
  result.confidence = Math.max(0, Math.min(1, result.confidence));

  return result;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Gemini API key
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error: 'GEMINI_API_KEY not configured',
          message: 'Please set the GEMINI_API_KEY secret in Supabase'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body
    const body = await req.json();
    const {
      caption,
      imageUrl,
      locationHint,
      postId,
      postedAt,
      ownerUsername,
      instagramAccountId,
      useOCR // Optional flag to force OCR extraction
    } = body;

    // Allow extraction with just imageUrl (for image-only posts)
    if (!caption && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Either caption or imageUrl is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`AI extraction for post: ${postId || 'unknown'}${imageUrl ? ' (with image)' : ''}`);

    // Initialize Supabase client for context building
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let context: AIContext;

    if (supabaseUrl && supabaseServiceKey) {
      // Build smart context from database
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      context = await buildAIContext({
        caption: caption || '',
        locationHint,
        postedAt,
        ownerUsername,
        instagramAccountId,
      }, supabase);

      console.log(`Context built: ${context.similarCorrections.length} corrections, ${context.knownVenues.length} venues, ${context.accountUsualVenues.length} account venues`);
    } else {
      // Fallback: no smart context, just raw data
      console.log('Supabase not configured, using raw data only');
      context = {
        caption: caption || '',
        locationHint: locationHint || null,
        postedAt: postedAt || null,
        ownerUsername: ownerUsername || null,
        similarCorrections: [],
        knownVenues: [],
        accountUsualVenues: [],
      };
    }

    let result: AIExtractionResult;

    // Use OCR extraction if imageUrl is provided and either:
    // 1. useOCR flag is explicitly set
    // 2. Caption is short/missing (details probably in image)
    const shouldUseOCR = imageUrl && supabaseUrl && supabaseServiceKey && (
      useOCR ||
      !caption ||
      (caption && caption.length < SHORT_CAPTION_THRESHOLD)
    );

    if (shouldUseOCR) {
      console.log(`Using OCR+AI extraction for post: ${postId || 'unknown'}`);
      const rawResult = await extractWithOCRAndAI(
        caption || '',
        imageUrl,
        context,
        supabaseUrl!,
        supabaseServiceKey!,
        geminiApiKey,
        postedAt // Pass post timestamp for relative date calculations
      );
      result = validateExtractionResult(rawResult);
    } else {
      // Standard caption-only AI extraction
      const prompt = buildExtractionPrompt(context, postedAt);
      const rawResult = await callGeminiAPI(prompt, geminiApiKey);
      result = validateExtractionResult(rawResult);
    }

    console.log(`AI extraction result for ${postId}: isEvent=${result.isEvent}, confidence=${result.confidence}, method=${result.extractionMethod || 'ai'}`);

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        extraction: result,
        contextUsed: {
          corrections: context.similarCorrections.length,
          knownVenues: context.knownVenues.length,
          accountVenues: context.accountUsualVenues.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('AI extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
