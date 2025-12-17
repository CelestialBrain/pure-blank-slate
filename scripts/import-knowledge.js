import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY="..." node scripts/import-knowledge.js <file.json>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Get file path from command line
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide a JSON file path');
  console.error('Usage: node scripts/import-knowledge.js <file.json>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// Detect file type and normalize data
function normalizeData(data, filename) {
  // If it's already normalized with table keys
  if (data.venues || data.patterns || data.geoConfig || data.accounts) {
    return data;
  }

  // If it's a plain array, detect type from filename or structure
  if (Array.isArray(data)) {
    const basename = path.basename(filename).toLowerCase();

    if (basename.includes('venue')) {
      return { venues: data };
    } else if (basename.includes('pattern')) {
      return { patterns: data };
    } else if (basename.includes('geo') || basename.includes('config')) {
      return { geoConfig: data };
    } else if (basename.includes('account') || basename.includes('instagram')) {
      return { accounts: data };
    } else {
      // Try to detect from first item structure
      if (data.length > 0) {
        const first = data[0];
        if (first.lat && first.lng && first.name) {
          return { venues: data };
        } else if (first.pattern_regex || first.pattern_type) {
          return { patterns: data };
        } else if (first.config_type) {
          return { geoConfig: data };
        } else if (first.username) {
          return { accounts: data };
        }
      }
    }
  }

  // Return as-is if we can't detect
  return data;
}

async function importVenues(venues) {
  if (!venues || venues.length === 0) return 0;

  console.log(`\nImporting ${venues.length} venues...`);
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const venue of venues) {
    try {
      // Prepare venue data (handle both old and new formats)
      const venueData = {
        name: venue.name,
        aliases: venue.aliases || [],
        address: venue.address || null,
        city: venue.city || null,
        lat: venue.lat || null,
        lng: venue.lng || null,
        instagram_handle: venue.instagram_handle || null,
        is_active: venue.is_active !== undefined ? venue.is_active : true
      };

      // Check if venue exists
      const { data: existing } = await supabase
        .from('known_venues')
        .select('id')
        .eq('name', venue.name)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('known_venues')
          .update(venueData)
          .eq('id', existing.id);

        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('known_venues')
          .insert(venueData);

        if (error) throw error;
        imported++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to import "${venue.name}": ${error.message}`);
      failed++;
    }
  }

  console.log(`  ✅ Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`);
  return imported + updated;
}

async function importPatterns(patterns) {
  if (!patterns || patterns.length === 0) return 0;

  console.log(`\nImporting ${patterns.length} patterns...`);
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const pattern of patterns) {
    try {
      // Prepare pattern data
      const patternData = {
        pattern_type: pattern.pattern_type,
        pattern_regex: pattern.pattern_regex,
        pattern_description: pattern.pattern_description || null,
        confidence_score: pattern.confidence_score || 0.8,
        success_count: pattern.success_count || 0,
        failure_count: pattern.failure_count || 0,
        source: pattern.source || 'manual',
        is_active: pattern.is_active !== undefined ? pattern.is_active : true
      };

      // Check if pattern exists
      const { data: existing } = await supabase
        .from('extraction_patterns')
        .select('id')
        .eq('pattern_type', pattern.pattern_type)
        .eq('pattern_regex', pattern.pattern_regex)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('extraction_patterns')
          .update(patternData)
          .eq('id', existing.id);

        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('extraction_patterns')
          .insert(patternData);

        if (error) throw error;
        imported++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to import pattern: ${error.message}`);
      failed++;
    }
  }

  console.log(`  ✅ Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`);
  return imported + updated;
}

async function importGeoConfig(geoConfig) {
  if (!geoConfig || geoConfig.length === 0) return 0;

  console.log(`\nImporting ${geoConfig.length} geo config entries...`);
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const config of geoConfig) {
    try {
      const configData = {
        config_type: config.config_type,
        config_key: config.config_key,
        config_value: config.config_value || null,
        notes: config.notes || null,
        is_active: config.is_active !== undefined ? config.is_active : true
      };

      // Check if config exists
      const { data: existing } = await supabase
        .from('geo_configuration')
        .select('id')
        .eq('config_type', config.config_type)
        .eq('config_key', config.config_key)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('geo_configuration')
          .update(configData)
          .eq('id', existing.id);

        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('geo_configuration')
          .insert(configData);

        if (error) throw error;
        imported++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to import geo config: ${error.message}`);
      failed++;
    }
  }

  console.log(`  ✅ Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`);
  return imported + updated;
}

async function importAccounts(accounts) {
  if (!accounts || accounts.length === 0) return 0;

  console.log(`\nImporting ${accounts.length} instagram accounts...`);
  let imported = 0;
  let updated = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const accountData = {
        username: account.username.toLowerCase(),
        is_active: account.is_active !== undefined ? account.is_active : true,
        default_category: account.default_category || null,
        last_scraped_at: account.last_scraped_at || null
      };

      // Check if account exists
      const { data: existing } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('username', accountData.username)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('instagram_accounts')
          .update(accountData)
          .eq('id', existing.id);

        if (error) throw error;
        updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('instagram_accounts')
          .insert(accountData);

        if (error) throw error;
        imported++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to import account @${account.username}: ${error.message}`);
      failed++;
    }
  }

  console.log(`  ✅ Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`);
  return imported + updated;
}

async function importKnowledge() {
  console.log(`Reading file: ${filePath}\n`);

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const data = normalizeData(rawData, filePath);

  console.log('=== Starting Import ===');

  let totalProcessed = 0;

  // Import each type
  if (data.venues) {
    totalProcessed += await importVenues(data.venues);
  }

  if (data.patterns) {
    totalProcessed += await importPatterns(data.patterns);
  }

  if (data.geoConfig) {
    totalProcessed += await importGeoConfig(data.geoConfig);
  }

  if (data.accounts) {
    totalProcessed += await importAccounts(data.accounts);
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Total records processed: ${totalProcessed}`);
}

importKnowledge().catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
