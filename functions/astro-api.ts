import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import * as sweph from 'sweph';
import path from 'path';

// Define types
interface PlanetPosition {
  name: string;
  longitude: number;
  latitude: number;
  distance: number;
  longitudeSpeed: number;
  sign: number;
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
}

interface SwephCalcResult {
  longitude: number;
  latitude: number;
  distance: number;
  longitudeSpeed: number;
  latitudeSpeed: number;
  distanceSpeed: number;
}

interface SwephHousesResult {
  ascendant: number;
  mc: number;
  houses: number[];
}

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize sweph
try {
  sweph.set_ephe_path(process.env.SWEPH_PATH || path.join(__dirname, 'ephemeris'));
} catch (error) {
  console.error('Error setting ephemeris path:', error);
}

// Helper function to calculate positions
async function calculatePositions(date: string, time: string, lat: number, lng: number): Promise<CalculationResult> {
  try {
    // Parse date and time
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute, second = 0] = time.split(':').map(Number);
    
    // Convert to Julian day
    const julday = sweph.julday(
      year, 
      month, 
      day, 
      hour + minute / 60 + second / 3600, 
      sweph.GREG_CAL
    );
    
    // Define planets
    const planets = [
      { id: sweph.SUN, name: 'Sun' },
      { id: sweph.MOON, name: 'Moon' },
      { id: sweph.MERCURY, name: 'Mercury' },
      { id: sweph.VENUS, name: 'Venus' },
      { id: sweph.MARS, name: 'Mars' },
      { id: sweph.JUPITER, name: 'Jupiter' },
      { id: sweph.SATURN, name: 'Saturn' },
      { id: sweph.URANUS, name: 'Uranus' },
      { id: sweph.NEPTUNE, name: 'Neptune' },
      { id: sweph.PLUTO, name: 'Pluto' }
    ];
    
    // Calculate positions for each planet
    const planetPositions: PlanetPosition[] = planets.map(planet => {
      const result = sweph.calc_ut(julday, planet.id, sweph.FLG_SWIEPH) as SwephCalcResult;
      return {
        name: planet.name,
        longitude: result.longitude,
        latitude: result.latitude,
        distance: result.distance,
        longitudeSpeed: result.longitudeSpeed,
        sign: Math.floor(result.longitude / 30) + 1
      };
    });
    
    // Calculate houses (ascendant and midheaven)
    const houses = sweph.houses(julday, lat, lng, 'P') as SwephHousesResult;
    
    return {
      planets: planetPositions,
      ascendant: houses.ascendant,
      midheaven: houses.mc,
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}:${second}`,
      location: { latitude: lat, longitude: lng }
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
        error: 'Missing required parameters: date, time, lat, lng' 
      });
    }
    
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
