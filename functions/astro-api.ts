import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import * as sweph from 'sweph';
import path from 'path';
import cors from 'cors';
import geoTz from 'geo-tz';

// Define types
interface PlanetPosition {
  name: string;
  longitude: number;
}

interface CalculationResult {
  planets: PlanetPosition[];
  ascendant: number;
  midheaven: number;
  date: string;
  time: string;
  location: {
    latitude: number;
    longitude: number;
  };
  timezone?: string;
}

// Initialize Express app
const app = express();
app.use(express.json());

// Enable CORS for all routes
app.use(cors());

// Initialize sweph
try {
  sweph.set_ephe_path(process.env.SWEPH_PATH || path.join(__dirname, 'ephemeris'));
} catch (error) {
  console.error('Error setting ephemeris path:', error);
}

// Helper function to get timezone offset in hours for a given date and location
function getTimezoneOffset(lat: number, lng: number, date: Date): number {
  // Get the timezone identifier for the coordinates
  const timezones = geoTz.find(lat, lng);
  const timezone = timezones[0]; // Use the first (most accurate) result

  // If we couldn't find a timezone, default to UTC
  if (!timezone) {
    return 0;
  }

  // Calculate UTC offset in hours (including DST)
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMinutes = (utcDate.getTime() - localDate.getTime()) / 60000;

  // Convert minutes to hours (standard timezone format)
  return offsetMinutes / 60;
}

// Helper function to calculate positions
async function calculatePositions(
  date: string,
  time: string,
  lat: number,
  lng: number
): Promise<CalculationResult> {
  try {
    // Parse date and time
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second = 0] = time.split(':').map(Number);

    // Create a date object for timezone calculations
    const dateObj = new Date(`${date}T${time}`);

    // Get the timezone offset for this location and date
    const tzOffset = getTimezoneOffset(lat, lng, dateObj);

    // Handle date adjustments when timezone offset causes day change
    let adjustedYear = year;
    let adjustedMonth = month;
    let adjustedDay = day;
    let adjustedHour = hour + tzOffset;

    // Handle negative hours (previous day)
    if (adjustedHour < 0) {
      // Create a new Date object and subtract one day
      const prevDay = new Date(dateObj);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);

      adjustedYear = prevDay.getUTCFullYear();
      adjustedMonth = prevDay.getUTCMonth() + 1; // JavaScript months are 0-indexed
      adjustedDay = prevDay.getUTCDate();
      adjustedHour += 24; // Add 24 hours to make it positive
    }
    // Handle hours >= 24 (next day)
    else if (adjustedHour >= 24) {
      // Create a new Date object and add one day
      const nextDay = new Date(dateObj);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      adjustedYear = nextDay.getUTCFullYear();
      adjustedMonth = nextDay.getUTCMonth() + 1; // JavaScript months are 0-indexed
      adjustedDay = nextDay.getUTCDate();
      adjustedHour -= 24; // Subtract 24 hours to bring it into range
    }

    // Convert to Julian day with timezone-adjusted values
    const julday = sweph.julday(
      adjustedYear,
      adjustedMonth,
      adjustedDay,
      adjustedHour + minute / 60 + second / 3600,
      sweph.constants.SE_GREG_CAL
    );

    // Define planets
    const planets = [
      { id: sweph.constants.SE_SUN, name: 'Sun' },
      { id: sweph.constants.SE_MOON, name: 'Moon' },
      { id: sweph.constants.SE_MERCURY, name: 'Mercury' },
      { id: sweph.constants.SE_VENUS, name: 'Venus' },
      { id: sweph.constants.SE_MARS, name: 'Mars' },
      { id: sweph.constants.SE_JUPITER, name: 'Jupiter' },
      { id: sweph.constants.SE_SATURN, name: 'Saturn' },
      { id: sweph.constants.SE_URANUS, name: 'Uranus' },
      { id: sweph.constants.SE_NEPTUNE, name: 'Neptune' },
      { id: sweph.constants.SE_PLUTO, name: 'Pluto' },
    ];

    // Calculate positions for each planet
    const planetPositions: PlanetPosition[] = planets.map((planet) => {
      const result = sweph.calc_ut(
        julday,
        planet.id,
        sweph.constants.SEFLG_SWIEPH | sweph.constants.SEFLG_SPEED
      );
      return {
        name: planet.name,
        longitude: result.data[0],
      };
    });

    // Calculate houses (ascendant and midheaven) using whole signs
    // TODO: add other house system options
    const houses = sweph.houses(julday, lat, lng, 'W');

    // Get timezone identifier
    const timezone = geoTz.find(lat, lng)[0] || 'UTC';

    return {
      planets: planetPositions,
      ascendant: houses.data.points[0],
      midheaven: houses.data.points[1],
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}:${second}`,
      location: { latitude: lat, longitude: lng },
      timezone: timezone,
    };
  } catch (error: any) {
    throw new Error(`Calculation error: ${error.message}`);
  }
}

// Main endpoint for positions
app.get('/api/positions', async (req: Request, res: Response) => {
  try {
    const { date, time, lat, lng } = req.query;

    // Validate parameters
    if (!date || !time || !lat || !lng) {
      return res.status(400).json({
        error: 'Missing required parameters: date, time, lat, lng',
      });
    }

    // TODO: allow passing location rather than lat/lng for easier API access
    const result = await calculatePositions(
      date as string,
      time as string,
      parseFloat(lat as string),
      parseFloat(lng as string)
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Astro API is running' });
});

// Handle 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Export handler for Netlify
export const handler = serverless(app);
