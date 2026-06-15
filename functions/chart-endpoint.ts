/**
 * chart-endpoint.ts — unified "date/time/place -> chart2txt text" route.
 *
 * ADDITIVE: this registers a new GET /api/chart route on the existing Express
 * app. It reuses the app's own calculatePositions / calculatePersonalityAndDesign
 * functions (passed in as `calc`) — it does NOT re-implement ephemeris math and
 * does NOT touch the existing /api/positions or /api/positions-with-design routes.
 *
 * GET /api/chart
 *   ?name=Jake&date=1990-05-15&time=14:30&place=Brooklyn,New York
 *   &type=natal|synastry|transit|humandesign   (default natal)
 *   &house_system=W                            (default W)
 *   &format=text|json                          (default text)
 *
 * Synastry / HD-partnership: repeat name/date/time/place as name2/date2/... .
 * Transit: add transit_date/transit_time/transit_place.
 *
 * Returns { text } for format=text (default) or the raw chart object for json.
 */

import { Request, Response, Express } from 'express';
import {
  chart2txt,
  humandesign2txt,
  humandesignPartnership2txt,
} from 'chart2txt';

const PHOTON = 'https://photon.komoot.io/api';

// ---- geocoding (ported from the astrology skill's astrochart.mjs) ----------

const COUNTRY_FIXUPS: [RegExp, string][] = [
  [/\bUSA\b/gi, 'United States'],
  [/\bU\.S\.A\.?\b/gi, 'United States'],
  [/\bU\.S\.\b/gi, 'United States'],
  [/\bUK\b/gi, 'United Kingdom'],
  [/\bU\.K\.\b/gi, 'United Kingdom'],
  [/\bUAE\b/gi, 'United Arab Emirates'],
];

function normalizePlace(place: string): string {
  let s = place;
  for (const [re, full] of COUNTRY_FIXUPS) s = s.replace(re, full);
  return s;
}

function placeRank(f: any): number {
  const p = f.properties || {};
  if (p.osm_key === 'place') {
    const v = p.osm_value;
    if (v === 'city') return 0;
    if (v === 'town') return 1;
    if (v === 'village' || v === 'municipality') return 2;
    if (v === 'suburb' || v === 'borough' || v === 'neighbourhood') return 3;
    return 4;
  }
  if (p.osm_key === 'boundary') return 5;
  return 9;
}

async function photonQuery(place: string, layers = true): Promise<any[]> {
  const params = new URLSearchParams();
  if (layers) {
    params.append('layer', 'city');
    params.append('layer', 'district');
  }
  params.append('q', place);
  params.append('limit', '10');
  const r = await fetch(`${PHOTON}?${params.toString()}`, {
    headers: { 'User-Agent': 'simple-astro-api-chart' },
  });
  if (!r.ok) throw new Error(`geocode failed (${r.status}) for "${place}"`);
  const j: any = await r.json();
  return j.features || [];
}

interface Geo {
  lat: number;
  lng: number;
  label: string;
}

async function geocode(rawPlace: string): Promise<Geo> {
  const place = normalizePlace(rawPlace);
  const cityOnly = place.split(',')[0].trim();
  let feats = await photonQuery(place);
  if (feats.length === 0 && cityOnly !== place) feats = await photonQuery(cityOnly);
  if (feats.length === 0) feats = await photonQuery(place, false);
  if (feats.length === 0) {
    throw new Error(`no geocode result for "${rawPlace}" — try "City, State" or "City, Country"`);
  }
  const best = feats.slice().sort((a, b) => placeRank(a) - placeRank(b))[0];
  const [lng, lat] = best.geometry.coordinates;
  const p = best.properties || {};
  const label = [p.name, p.state, p.country].filter(Boolean).join(', ') || rawPlace;
  return { lat, lng, label };
}

// ---- mapping the calc result onto chart2txt's ChartData --------------------

function normTime(t?: string): string {
  if (!t) return '12:00:00';
  const parts = t.split(':');
  while (parts.length < 3) parts.push('00');
  return parts.slice(0, 3).map((p) => p.padStart(2, '0')).join(':');
}

function toChart(
  name: string,
  place: string,
  date: string,
  time: string,
  api: any,
  opts: { unknownTime?: boolean; chartType?: string }
): any {
  const chart: any = {
    name,
    location: place,
    timestamp: new Date(`${date}T${time}`),
    chartType: opts.chartType || 'natal',
    planets: api.planets.map((p: any) => ({ name: p.name, degree: p.longitude, speed: p.speed })),
  };
  if (!opts.unknownTime) {
    chart.ascendant = api.ascendant;
    chart.midheaven = api.midheaven;
    chart.houseCusps = api.houseCusps;
    chart.houseSystemName = api.houseSystemName;
  }
  return chart;
}

// The calculation interface the host app supplies (its own internal functions).
export interface CalcDeps {
  calculatePositions: (
    date: string,
    time: string,
    lat: number,
    lng: number,
    houseSystemChar?: string
  ) => Promise<any>;
  calculatePersonalityAndDesign: (
    date: string,
    time: string,
    lat: number,
    lng: number,
    houseSystemChar?: string
  ) => Promise<any>;
}

interface PersonParams {
  name: string;
  date: string;
  time: string;
  place: string;
}

function readPerson(q: any, suffix: string): PersonParams | null {
  const date = q[`date${suffix}`];
  const place = q[`place${suffix}`];
  if (!date || !place) return null;
  return {
    name: (q[`name${suffix}`] as string) || (suffix ? `Person ${suffix}` : 'Person 1'),
    date: date as string,
    time: (q[`time${suffix}`] as string) || '',
    place: place as string,
  };
}

/**
 * Registers GET /api/chart on the given app. Call this BEFORE the 404 handler.
 */
export function registerChartEndpoint(app: Express, calc: CalcDeps): void {
  app.get('/api/chart', async (req: Request, res: Response) => {
    try {
      const q = req.query as any;
      const type = ((q.type as string) || 'natal').toLowerCase();
      const houseSystem = (q.house_system as string) || 'W';
      const format = ((q.format as string) || 'text').toLowerCase();
      const unknownTime = q.unknown_time === '1' || q.unknown_time === 'true';

      const p1 = readPerson(q, '');
      if (!p1) {
        return res.status(400).json({ error: 'Missing required parameters: date, place (and usually time)' });
      }
      const p2 = readPerson(q, '2');

      // ---- Human Design path -----------------------------------------------
      if (type === 'humandesign' || type === 'human-design' || type === 'hd') {
        const g1 = await geocode(p1.place);
        const hd1 = await calc.calculatePersonalityAndDesign(p1.date, normTime(p1.time), g1.lat, g1.lng, houseSystem);
        if (p2) {
          const g2 = await geocode(p2.place);
          const hd2 = await calc.calculatePersonalityAndDesign(p2.date, normTime(p2.time), g2.lat, g2.lng, houseSystem);
          if (format === 'json') return res.json({ person1: hd1, person2: hd2 });
          const text = humandesignPartnership2txt(hd1, hd2, {
            person1Name: p1.name,
            person1Location: g1.label,
            person2Name: p2.name,
            person2Location: g2.label,
          });
          return res.json({ text });
        }
        if (format === 'json') return res.json(hd1);
        return res.json({ text: humandesign2txt(hd1, { name: p1.name, location: g1.label }) });
      }

      // ---- Astrology path (natal / synastry / transit) ---------------------
      const charts: any[] = [];
      const people = p2 ? [p1, p2] : [p1];
      for (const person of people) {
        const g = await geocode(person.place);
        const time = normTime(person.time);
        const api = await calc.calculatePositions(person.date, time, g.lat, g.lng, houseSystem);
        charts.push(toChart(person.name, g.label, person.date, time, api, { unknownTime, chartType: 'natal' }));
      }

      if (type === 'transit') {
        const tDate = q.transit_date as string;
        if (!tDate) {
          return res.status(400).json({ error: 'type=transit requires transit_date (and usually transit_time/transit_place)' });
        }
        const tPlace = (q.transit_place as string) || p1.place;
        const tTime = normTime(q.transit_time as string);
        const g = await geocode(tPlace);
        const api = await calc.calculatePositions(tDate, tTime, g.lat, g.lng, houseSystem);
        charts.push(toChart('Transit', g.label, tDate, tTime, api, { unknownTime: false, chartType: 'transit' }));
      }

      const payload = charts.length === 1 ? charts[0] : charts;
      if (format === 'json') return res.json(payload);
      return res.json({ text: chart2txt(payload) });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}
