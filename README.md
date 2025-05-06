# Simple Astro API

A simple Netlify serverless API using TypeScript and the `sweph` package to calculate planetary positions, ascendant, and midheaven.

## Project Structure

```
simple-astro-api/
├── tsconfig.json    # TypeScript configuration
├── netlify.toml     # Netlify configuration
├── package.json     # Dependencies 
└── functions/
    └── astro-api.ts # Express app as serverless function
```

## API Endpoints

### GET /api/positions

Returns planetary positions, ascendant, and midheaven for a given date, time, and location.

**Query Parameters:**
- `date`: Date in YYYY-MM-DD format
- `time`: Time in HH:MM:SS format (24-hour)
- `lat`: Latitude in decimal degrees
- `lng`: Longitude in decimal degrees
- `houseSystem`: House system character in sweph format (default: W)

**Example Request:**
```
/api/positions?date=2023-01-01&time=12:00:00&lat=40.7128&lng=-74.0060&houseSystem=O
```

### GET /api/health

Health check endpoint to verify the API is running.

## Development

1. Install dependencies:
   ```
   npm install
   ```

2. Install Netlify CLI (if not already installed):
   ```
   npm install netlify-cli -g
   ```

3. You'll need to download Swiss Ephemeris files and set the path:
   - Download ephemeris files from https://www.astro.com/ftp/swisseph/ephe/
   - Create an `ephemeris` directory in the functions directory and place the files there
   - Or set the `SWEPH_PATH` environment variable to point to your ephemeris files

4. Build the TypeScript code:
   ```
   npm run build
   ```

5. Run locally:
   ```
   npm run dev
   ```

## Deployment

1. Connect to your Netlify account:
   ```
   netlify login
   ```

2. Deploy to Netlify:
   ```
   netlify deploy --prod
   ```

**Note:** For production deployment, you'll need to include the ephemeris files with your function. Make sure to copy them to the dist/functions/ephemeris directory during the build process.