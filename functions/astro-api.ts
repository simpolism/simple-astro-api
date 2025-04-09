import express, { Request, Response } from 'express';
import serverless from 'serverless-http';
import * as sweph from 'sweph';
import path from 'path';

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
      { id: sweph.constants.SE_PLUTO, name: 'Pluto' }
    ];
    
    // Calculate positions for each planet
    const planetPositions: PlanetPosition[] = planets.map(planet => {
      const result = sweph.calc_ut(julday, planet.id, sweph.constants.SEFLG_SWIEPH);
      return {
        name: planet.name,
        longitude: result.data[0],
      };
    });
    
    // Calculate houses (ascendant and midheaven) (whole sign)
    const houses = sweph.houses(julday, lat, lng, 'W');
    
    return {
      planets: planetPositions,
      ascendant: houses.data.points[0],
      midheaven: houses.data.points[1],
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
