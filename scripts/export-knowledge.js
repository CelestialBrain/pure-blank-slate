import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function exportKnowledge() {
  console.log('Exporting all knowledge data...\n');

  // Export venues
  const { data: venues, error: venuesError } = await supabase
    .from('known_venues')
    .select('*')
    .order('name');

  if (venuesError) {
    console.error(`❌ Error fetching venues: ${venuesError.message}`);
  } else {
    console.log(`✅ Fetched ${venues.length} venues`);
  }

  // Export patterns
  const { data: patterns, error: patternsError } = await supabase
    .from('extraction_patterns')
    .select('*')
    .order('created_at');

  if (patternsError) {
    console.error(`❌ Error fetching patterns: ${patternsError.message}`);
  } else {
    console.log(`✅ Fetched ${patterns.length} patterns`);
  }

  // Export geo config
  const { data: geoConfig, error: geoError } = await supabase
    .from('geo_configuration')
    .select('*')
    .order('config_type, config_key');

  if (geoError) {
    console.error(`❌ Error fetching geo config: ${geoError.message}`);
  } else {
    console.log(`✅ Fetched ${geoConfig.length} geo config entries`);
  }

  // Export instagram accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('instagram_accounts')
    .select('*')
    .order('username');

  if (accountsError) {
    console.error(`❌ Error fetching accounts: ${accountsError.message}`);
  } else {
    console.log(`✅ Fetched ${accounts.length} instagram accounts`);
  }

  // Create exports directory
  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  // Export venues
  if (venues) {
    const venuesFile = path.join(exportsDir, `venues-${timestamp}.json`);
    fs.writeFileSync(venuesFile, JSON.stringify(venues, null, 2));
    console.log(`\n📦 Exported venues to: ${venuesFile}`);
  }

  // Export patterns
  if (patterns) {
    const patternsFile = path.join(exportsDir, `patterns-${timestamp}.json`);
    fs.writeFileSync(patternsFile, JSON.stringify(patterns, null, 2));
    console.log(`📦 Exported patterns to: ${patternsFile}`);
  }

  // Export geo config
  if (geoConfig) {
    const geoFile = path.join(exportsDir, `geo-config-${timestamp}.json`);
    fs.writeFileSync(geoFile, JSON.stringify(geoConfig, null, 2));
    console.log(`📦 Exported geo config to: ${geoFile}`);
  }

  // Export accounts
  if (accounts) {
    const accountsFile = path.join(exportsDir, `accounts-${timestamp}.json`);
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
    console.log(`📦 Exported accounts to: ${accountsFile}`);
  }

  // Export combined file
  const combined = {
    exportedAt: new Date().toISOString(),
    venues: venues || [],
    patterns: patterns || [],
    geoConfig: geoConfig || [],
    accounts: accounts || []
  };
  const combinedFile = path.join(exportsDir, `knowledge-all-${timestamp}.json`);
  fs.writeFileSync(combinedFile, JSON.stringify(combined, null, 2));
  console.log(`📦 Exported combined to: ${combinedFile}`);

  console.log(`\n✅ Export complete!`);
  console.log(`\nTo import, run:`);
  console.log(`  node scripts/import-knowledge.js <filename>`);
}

exportKnowledge().catch(console.error);
