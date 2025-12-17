# Knowledge Data Import/Export System

This system allows you to mass edit knowledge data (venues, patterns, geo config, instagram accounts) via JSON files.

## Features

- **Backwards Compatible**: Accepts old export formats automatically
- **Flexible Format Detection**: Auto-detects data type from filename or structure
- **Upsert Logic**: Updates existing records, inserts new ones
- **All Knowledge Tables**: Works with venues, patterns, geo config, and instagram accounts

## Quick Start

### Export Current Data

```bash
cd scripts
SUPABASE_SERVICE_ROLE_KEY="your-key" npm run export
```

This creates timestamped files in `scripts/exports/`:
- `venues-YYYY-MM-DDTHH-MM-SS.json`
- `patterns-YYYY-MM-DDTHH-MM-SS.json`
- `geo-config-YYYY-MM-DDTHH-MM-SS.json`
- `accounts-YYYY-MM-DDTHH-MM-SS.json`
- `knowledge-all-YYYY-MM-DDTHH-MM-SS.json` (combined)

### Import Data

Import any exported JSON file (old or new format):

```bash
SUPABASE_SERVICE_ROLE_KEY="your-key" npm run import exports/venues-2024-12-18.json
```

Or import from anywhere:

```bash
SUPABASE_SERVICE_ROLE_KEY="your-key" node import-knowledge.js /path/to/your-old-export.json
```

## Supported File Formats

### 1. Single Table Array (Old Format)
```json
[
  {
    "name": "SaGuijo",
    "lat": 14.5650,
    "lng": 121.0220,
    "city": "Makati",
    "aliases": ["Sa Guijo", "SaGuijo Bar"]
  }
]
```

### 2. Combined Format (New Format)
```json
{
  "exportedAt": "2024-12-18T10:00:00.000Z",
  "venues": [...],
  "patterns": [...],
  "geoConfig": [...],
  "accounts": [...]
}
```

The import script automatically detects which format you're using!

## Data Structure

### Venues
```json
{
  "name": "Venue Name",           // Required, unique
  "aliases": ["Alias1", "Alias2"], // Optional
  "address": "Street Address",    // Optional
  "city": "City Name",            // Optional
  "lat": 14.5650,                 // Optional
  "lng": 121.0220,                // Optional
  "instagram_handle": "handle",   // Optional (without @)
  "is_active": true               // Optional, defaults to true
}
```

### Patterns
```json
{
  "pattern_type": "time",         // Required: time, date, venue, price, signup_url
  "pattern_regex": "\\d{1,2}pm",  // Required
  "pattern_description": "...",   // Optional
  "confidence_score": 0.8,        // Optional, defaults to 0.8
  "success_count": 10,            // Optional, defaults to 0
  "failure_count": 2,             // Optional, defaults to 0
  "source": "manual",             // Optional: manual, learned, community
  "is_active": true               // Optional, defaults to true
}
```

### Geo Configuration
```json
{
  "config_type": "ncr_bounds",    // Required: ncr_bounds or non_ncr_keyword
  "config_key": "minLat",         // Required
  "config_value": "14.35",        // Optional (for bounds)
  "notes": "Southern boundary",   // Optional
  "is_active": true               // Optional, defaults to true
}
```

### Instagram Accounts
```json
{
  "username": "venuehandle",      // Required (auto-lowercased)
  "is_active": true,              // Optional, defaults to true
  "default_category": "music",    // Optional
  "last_scraped_at": "2024-..."   // Optional
}
```

## Workflow Examples

### Edit Venues in Bulk

1. Export current venues:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY="..." npm run export
   ```

2. Open `exports/venues-YYYY-MM-DD....json` in your editor

3. Make changes:
   - Add new venues
   - Update coordinates
   - Add aliases
   - Delete unwanted venues (remove from array)

4. Import changes:
   ```bash
   SUPABASE_SERVICE_ROLE_KEY="..." npm run import exports/venues-YYYY-MM-DD....json
   ```

### Import Old Data

Just paste your old export file anywhere and import it:

```bash
SUPABASE_SERVICE_ROLE_KEY="..." node import-knowledge.js ~/old-data/venues.json
```

The script will:
- Auto-detect it's a venues file
- Handle the old format
- Update existing venues
- Insert new ones

### Batch Import Multiple Files

```bash
for file in old-exports/*.json; do
  SUPABASE_SERVICE_ROLE_KEY="..." node import-knowledge.js "$file"
done
```

## Tips

- **Backup First**: Always export before making major changes
- **Test Small**: Try importing a small test file first
- **Check Logs**: The import script shows detailed progress
- **Upsert Safety**: Existing records are updated, not duplicated
- **Validation**: Invalid records are skipped with error messages

## Environment Variables

Set your service role key:

```bash
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
```

Or pass inline:

```bash
SUPABASE_SERVICE_ROLE_KEY="eyJhbG..." npm run import file.json
```

## Other Scripts

- `npm run seed:patterns` - Seed hardcoded patterns
- `npm run seed:venues` - Seed known venues from SQL
- `npm run seed:venues:exact` - Seed exact venues from migration
- `npm run verify` - Check database state
