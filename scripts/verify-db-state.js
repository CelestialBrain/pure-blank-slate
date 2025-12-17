import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function verifyDatabase() {
  console.log('=== Database State Verification ===\n');

  // Check geo_configuration
  console.log('1. Checking geo_configuration table...');
  const { data: geoConfig, error: geoError } = await supabase
    .from('geo_configuration')
    .select('*')
    .limit(5);

  if (geoError) {
    console.error(`❌ Error fetching geo_configuration: ${geoError.message}`);
  } else {
    console.log(`✅ geo_configuration exists with ${geoConfig?.length || 0} sample rows`);
    if (geoConfig && geoConfig.length > 0) {
      console.log(`   Sample: ${geoConfig[0].config_type} - ${geoConfig[0].config_key}`);
    }
  }

  // Check known_venues
  console.log('\n2. Checking known_venues table...');
  const { data: venues, error: venuesError, count } = await supabase
    .from('known_venues')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  if (venuesError) {
    console.error(`❌ Error fetching known_venues: ${venuesError.message}`);
  } else {
    console.log(`✅ known_venues has ${count} total venues`);
    if (venues && venues.length > 0) {
      console.log(`   Sample venue: ${venues[0].name} (${venues[0].city})`);
    }
  }

  // Check extraction_patterns
  console.log('\n3. Checking extraction_patterns table...');
  const { data: patterns, error: patternsError, count: patternCount } = await supabase
    .from('extraction_patterns')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  if (patternsError) {
    console.error(`❌ Error fetching extraction_patterns: ${patternsError.message}`);
  } else {
    console.log(`✅ extraction_patterns has ${patternCount} total patterns`);
    if (patterns && patterns.length > 0) {
      console.log(`   Sample pattern: ${patterns[0].pattern_type} - ${patterns[0].pattern_regex.substring(0, 50)}...`);
    }
  }

  // Check instagram_accounts
  console.log('\n4. Checking instagram_accounts table...');
  const { data: accounts, error: accountsError, count: accountCount } = await supabase
    .from('instagram_accounts')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  if (accountsError) {
    console.error(`❌ Error fetching instagram_accounts: ${accountsError.message}`);
  } else {
    console.log(`✅ instagram_accounts has ${accountCount} total accounts`);
    if (accounts && accounts.length > 0) {
      console.log(`   Sample account: @${accounts[0].username}`);
    }
  }

  console.log('\n=== Verification Complete ===');
}

verifyDatabase().catch(console.error);
