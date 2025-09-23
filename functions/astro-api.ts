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
  speed: number;
}

interface CalculationResult {
  planets: PlanetPosition[];
  ascendant: number;
  midheaven: number;
  houseCusps: number[];
  houseSystemName: string;
  date: string;
  time: string;
  location: {
    latitude: number;
    longitude: number;
  };
  timezone?: string;
}

// House System Names
const HOUSE_SYSTEM_NAMES: { [key: string]: string } = {
  W: 'Whole Sign',
  P: 'Placidus',
  K: 'Koch',
  O: 'Porphyry',
  R: 'Regiomontanus',
  C: 'Campanus',
  E: 'Equal',
  V: 'Vehlow Equal',
  A: 'Alcabitius',
  X: 'Axial Rotation System / Meridian Houses',
  M: 'Morinus',
  B: 'APC Houses',
};

function getHouseSystemName(systemChar: string): string {
  return HOUSE_SYSTEM_NAMES[systemChar.toUpperCase()] || `Unknown (${systemChar})`;
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

interface TimeConversionResult {
  utcDate: Date;
  timezone: string;
  tzOffset: number;
  adjusted: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

function convertLocalToUtc(
  date: string,
  time: string,
  lat: number,
  lng: number
): TimeConversionResult {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);

  const dateObj = new Date(`${date}T${time}`);
  const tzOffset = getTimezoneOffset(lat, lng, isNaN(dateObj.getTime()) ? new Date(date) : dateObj);

  let adjustedYear = year;
  let adjustedMonth = month;
  let adjustedDay = day;
  let adjustedHour = hour + tzOffset;

  while (adjustedHour < 0) {
    const prevDay = new Date(Date.UTC(adjustedYear, adjustedMonth - 1, adjustedDay));
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    adjustedYear = prevDay.getUTCFullYear();
    adjustedMonth = prevDay.getUTCMonth() + 1;
    adjustedDay = prevDay.getUTCDate();
    adjustedHour += 24;
  }

  while (adjustedHour >= 24) {
    const nextDay = new Date(Date.UTC(adjustedYear, adjustedMonth - 1, adjustedDay));
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    adjustedYear = nextDay.getUTCFullYear();
    adjustedMonth = nextDay.getUTCMonth() + 1;
    adjustedDay = nextDay.getUTCDate();
    adjustedHour -= 24;
  }

  const timezone = geoTz.find(lat, lng)[0] || 'UTC';

  const totalHours = adjustedHour + minute / 60 + second / 3600;
  const utcMillis =
    Date.UTC(adjustedYear, adjustedMonth - 1, adjustedDay) + totalHours * 3600 * 1000;
  const utcDate = new Date(utcMillis);

  return {
    utcDate,
    timezone,
    tzOffset,
    adjusted: {
      year: adjustedYear,
      month: adjustedMonth,
      day: adjustedDay,
      hour: adjustedHour,
      minute,
      second,
    },
  };
}

function formatDateTimeInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  return {
    date: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    time: `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`,
  };
}

function getSunLongitudeAt(date: Date): number {
  const julday = sweph.julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600 +
      date.getUTCMilliseconds() / 3600000,
    sweph.constants.SE_GREG_CAL
  );

  const result = sweph.calc_ut(
    julday,
    sweph.constants.SE_SUN,
    sweph.constants.SEFLG_SWIEPH | sweph.constants.SEFLG_SPEED
  );

  return result.data[0];
}

function solarArcDifference(personalityLongitude: number, candidateLongitude: number): number {
  return (personalityLongitude - candidateLongitude + 360) % 360;
}

function findDesignUtcDate(
  birthUtcDate: Date,
  personalitySunLongitude: number
): { utcDate: Date; sunLongitude: number; solarArcDegrees: number } {
  const targetArc = 88;
  const dayMs = 24 * 60 * 60 * 1000;

  let lookbackDays = 95;
  let lowTime = birthUtcDate.getTime() - lookbackDays * dayMs;
  let lowLongitude = getSunLongitudeAt(new Date(lowTime));
  let lowDiff = solarArcDifference(personalitySunLongitude, lowLongitude);

  while (lowDiff < targetArc && lookbackDays < 200) {
    lookbackDays += 10;
    lowTime = birthUtcDate.getTime() - lookbackDays * dayMs;
    lowLongitude = getSunLongitudeAt(new Date(lowTime));
    lowDiff = solarArcDifference(personalitySunLongitude, lowLongitude);
  }

  if (lowDiff < targetArc) {
    throw new Error('Unable to determine design moment within search window.');
  }

  let highTime = birthUtcDate.getTime();
  let bestDate = new Date(lowTime);
  let bestLongitude = lowLongitude;
  let bestDiff = Math.abs(lowDiff - targetArc);

  for (let i = 0; i < 60; i++) {
    const midTime = (lowTime + highTime) / 2;
    const midDate = new Date(midTime);
    const midLongitude = getSunLongitudeAt(midDate);
    const midDiff = solarArcDifference(personalitySunLongitude, midLongitude);
    const midDelta = Math.abs(midDiff - targetArc);

    if (midDelta < bestDiff) {
      bestDiff = midDelta;
      bestDate = midDate;
      bestLongitude = midLongitude;
    }

    if (midDiff > targetArc) {
      lowTime = midTime;
    } else {
      highTime = midTime;
    }
  }

  const lowDateFinal = new Date(lowTime);
  const lowLongitudeFinal = getSunLongitudeAt(lowDateFinal);
  const lowDeltaFinal = Math.abs(
    solarArcDifference(personalitySunLongitude, lowLongitudeFinal) - targetArc
  );
  if (lowDeltaFinal < bestDiff) {
    bestDate = lowDateFinal;
    bestLongitude = lowLongitudeFinal;
    bestDiff = lowDeltaFinal;
  }

  const highDateFinal = new Date(highTime);
  const highLongitudeFinal = getSunLongitudeAt(highDateFinal);
  const highDeltaFinal = Math.abs(
    solarArcDifference(personalitySunLongitude, highLongitudeFinal) - targetArc
  );
  if (highDeltaFinal < bestDiff) {
    bestDate = highDateFinal;
    bestLongitude = highLongitudeFinal;
    bestDiff = highDeltaFinal;
  }

  const finalArc = solarArcDifference(personalitySunLongitude, bestLongitude);

  return {
    utcDate: bestDate,
    sunLongitude: bestLongitude,
    solarArcDegrees: finalArc,
  };
}

// Helper function to calculate positions
async function calculatePositions(
  date: string,
  time: string,
  lat: number,
  lng: number,
  houseSystemChar = 'W' // Default to whole sign
): Promise<CalculationResult> {
  try {
    const timeConversion = convertLocalToUtc(date, time, lat, lng);
    const {
      adjusted: { year: adjustedYear, month: adjustedMonth, day: adjustedDay, hour: adjustedHour, minute, second },
      timezone,
    } = timeConversion;

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
      { id: sweph.constants.SE_TRUE_NODE, name: 'North Node' },
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
        speed: result.data[3],
      };
    });

    // Calculate houses (ascendant and midheaven)
    const houses = sweph.houses(julday, lat, lng, houseSystemChar.toUpperCase());

    // Get timezone identifier
    const timezoneId = timezone;

    // Extract house cusps and determine house system name
    const rawCusps = houses.data.houses;
    const currentHouseSystemName = getHouseSystemName(houseSystemChar);

    return {
      planets: planetPositions,
      ascendant: houses.data.points[0],
      midheaven: houses.data.points[1], // Midheaven is at index 1
      houseCusps: rawCusps,
      houseSystemName: currentHouseSystemName,
      date,
      time,
      location: { latitude: lat, longitude: lng },
      timezone: timezoneId,
    };
  } catch (error: any) {
    throw new Error(`Calculation error: ${error.message}`);
  }
}

interface CombinedCalculationResult {
  personality: CalculationResult;
  design: CalculationResult;
  metadata: {
    designUtcDateTime: string;
    solarArcDegrees: number;
    personalitySunLongitude: number;
    designSunLongitude: number;
  };
}

async function calculatePersonalityAndDesign(
  date: string,
  time: string,
  lat: number,
  lng: number,
  houseSystemChar = 'W'
): Promise<CombinedCalculationResult> {
  const personality = await calculatePositions(date, time, lat, lng, houseSystemChar);

  const sun = personality.planets.find((planet) => planet.name === 'Sun');
  if (!sun) {
    throw new Error('Unable to determine Sun longitude for personality chart.');
  }

  const timeConversion = convertLocalToUtc(date, time, lat, lng);
  const designMoment = findDesignUtcDate(timeConversion.utcDate, sun.longitude);

  const timezoneId = personality.timezone || timeConversion.timezone;
  const designLocal = formatDateTimeInTimeZone(designMoment.utcDate, timezoneId);
  const design = await calculatePositions(
    designLocal.date,
    designLocal.time,
    lat,
    lng,
    houseSystemChar
  );

  return {
    personality,
    design,
    metadata: {
      designUtcDateTime: designMoment.utcDate.toISOString(),
      solarArcDegrees: designMoment.solarArcDegrees,
      personalitySunLongitude: sun.longitude,
      designSunLongitude: designMoment.sunLongitude,
    },
  };
}

// Main endpoint for positions
app.get('/api/positions', async (req: Request, res: Response) => {
  try {
    const { date, time, lat, lng, house_system } = req.query;

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
      parseFloat(lng as string),
      house_system as string | undefined
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions-with-design', async (req: Request, res: Response) => {
  try {
    const { date, time, lat, lng, house_system } = req.query;

    if (!date || !time || !lat || !lng) {
      return res.status(400).json({
        error: 'Missing required parameters: date, time, lat, lng',
      });
    }

    const result = await calculatePersonalityAndDesign(
      date as string,
      time as string,
      parseFloat(lat as string),
      parseFloat(lng as string),
      house_system as string | undefined
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
