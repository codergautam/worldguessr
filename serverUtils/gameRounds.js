import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import GameRound from '../models/GameRound.js';
import MapModel from '../models/Map.js';
import { resolveGooglePano } from './googlePano.js';
import officialCountryMaps from '../public/officialCountryMaps.json' with { type: 'json' };
import continentMapping from '../public/continentMapping.json' with { type: 'json' };
import countryMaxDists from '../public/countryMaxDists.json' with { type: 'json' };
import countries from '../public/countries.json' with { type: 'json' };

const ROUND_TTL_MS = 5 * 60 * 1000;
const COOKIE_NAME = 'wg_round_session';
let worldPool;
let worldByCountry;

function getWorldPool() {
  if (!worldPool) {
    worldPool = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/world-main.json'), 'utf8'));
  }
  return worldPool;
}

function getWorldByCountry(country) {
  if (!worldByCountry) {
    worldByCountry = new Map();
    for (const point of getWorldPool()) {
      if (!point.country || point.panoValid === false) continue;
      if (!worldByCountry.has(point.country)) worldByCountry.set(point.country, []);
      worldByCountry.get(point.country).push(point);
    }
  }
  return worldByCountry.get(country) || [];
}

export function getRoundSession(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.ROUND_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const trustedOrigin = typeof origin === 'string' && (() => {
    try {
      const hostname = new URL(origin).hostname;
      return allowedOrigins.includes(origin) || hostname === 'localhost' || hostname === '127.0.0.1'
        || hostname === 'worldguessr.com' || hostname.endsWith('.worldguessr.com')
        || hostname === 'schoolguessr.com' || hostname.endsWith('.schoolguessr.com');
    } catch { return false; }
  })();
  if (trustedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Credentials');
  }
  const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith(`${COOKIE_NAME}=`));
  let sessionId = cookie?.slice(COOKIE_NAME.length + 1);
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) {
    sessionId = randomBytes(32).toString('hex');
    const secure = process.env.NODE_ENV === 'production' ? '; Secure; SameSite=None' : '; SameSite=Lax';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sessionId}; Path=/api; HttpOnly; Max-Age=2592000${secure}`);
  }
  return createHash('sha256').update(sessionId).digest('hex');
}

async function getCandidate(location) {
  if (location === 'china') {
    const pool = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/china-baidu.json'), 'utf8'));
    const point = pool[Math.floor(Math.random() * pool.length)];
    if (!point?.panoId) throw new Error('round unavailable');
    return { point, maxDist: countryMaxDists.CN, official: true, provider: 'baidu' };
  }
  if (typeof location === 'string' && location && location !== 'all') {
    const officialMap = Object.values(officialCountryMaps).find((map) => map.slug === location);
    if (officialMap?.countryCode) {
      const pointsForCountry = getWorldByCountry(officialMap.countryCode);
      if (pointsForCountry.length) {
        return { point: pointsForCountry[Math.floor(Math.random() * pointsForCountry.length)], maxDist: officialMap.maxDist || 20000, official: true, provider: 'google' };
      }
    }
    const map = await MapModel.findOne({ slug: location, accepted: true }).select('data maxDist official').lean();
    const mapPoints = map?.data?.locations || map?.data;
    const points = Array.isArray(mapPoints) ? mapPoints.filter((point) => point.panoValid !== false) : mapPoints;
    if (Array.isArray(points) && points.length) {
      const point = points[Math.floor(Math.random() * points.length)];
      return { point, maxDist: map.maxDist || 20000, official: !!map.official, provider: 'google' };
    }
    const country = location.toUpperCase();
    const pointsForCountry = getWorldByCountry(country);
    if (pointsForCountry.length) {
      return { point: pointsForCountry[Math.floor(Math.random() * pointsForCountry.length)], maxDist: 20000, official: true, provider: 'google' };
    }
    throw new Error('round unavailable');
  }
  const pool = getWorldPool().filter((point) => point.panoValid !== false);
  return { point: pool[Math.floor(Math.random() * pool.length)], maxDist: 20000, official: true, provider: 'google' };
}

export async function createGameRound(req, res) {
  const sessionId = getRoundSession(req, res);
  let candidate;
  let choices;
  const onboardingIndex = Number(req.body?.onboardingIndex);
  const tutorial = [
    { lat: 40.7566514, lng: -73.986534, heading: 31, country: 'US', choices: ['GB', 'JP', 'AU', 'US'], factKey: 'onboardingFact2' },
    { lat: 48.8583601, lng: 2.2915727, heading: 41, country: 'FR', choices: ['IT', 'ES', 'DE', 'FR'], factKey: 'onboardingFact3' },
    { lat: 29.9773337, lng: 31.1321796, heading: 223, pitch: 5, country: 'EG', choices: ['TR', 'BR', 'IN', 'EG'], factKey: 'onboardingFact1' },
  ];
  if (Number.isInteger(onboardingIndex) && tutorial[onboardingIndex]) {
    const point = tutorial[onboardingIndex];
    candidate = { point, maxDist: 20000, official: true };
  } else if (req.body?.countryGuesser === true) {
    const subMode = req.body?.countryGuessrSubMode === 'continent' ? 'continent' : 'country';
    const region = req.body?.region;
    const candidates = getWorldPool().filter((point) => point.country && point.panoValid !== false
      && (subMode !== 'continent' || continentMapping[point.country])
      && (!region || region === 'all' || continentMapping[point.country] === region));
    if (!candidates.length) throw new Error('round unavailable');
    candidate = { point: candidates[Math.floor(Math.random() * candidates.length)], maxDist: 20000, official: true };
    if (subMode === 'country') {
      const distractors = countries.filter((country) => country !== candidate.point.country);
      choices = [candidate.point.country];
      while (choices.length < 6 && distractors.length) {
        const index = Math.floor(Math.random() * distractors.length);
        choices.push(distractors.splice(index, 1)[0]);
      }
      choices.sort(() => Math.random() - 0.5);
    }
  } else {
    candidate = await getCandidate(req.body?.location);
  }
  const { point, maxDist, official, provider = 'google' } = candidate;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng ?? point.long)) throw new Error('round unavailable');
  const actual = provider === 'baidu'
    ? { lat: point.lat, lng: point.lng ?? point.long, panoId: point.panoId }
    : await resolveGooglePano(point.lat, point.lng ?? point.long, point.panoId);
  const now = new Date();
  const roundId = randomBytes(16).toString('hex');
  await GameRound.create({
    roundId,
    sessionId,
    lat: actual.lat,
    lng: actual.lng,
    panoId: actual.panoId,
    provider,
    country: point.country || null,
    maxDist,
    official,
    countryGuesser: req.body?.countryGuesser === true,
    countryGuessrSubMode: req.body?.countryGuessrSubMode === 'continent' ? 'continent' : 'country',
    createdAt: now,
    expiresAt: new Date(now.getTime() + ROUND_TTL_MS),
  });
  return {
    roundId,
    panoId: actual.panoId,
    provider,
    ...(Number.isInteger(onboardingIndex) && tutorial[onboardingIndex]
      ? { choices: tutorial[onboardingIndex].choices, factKey: tutorial[onboardingIndex].factKey, heading: point.heading, pitch: point.pitch }
      : choices ? { choices } : {}),
  };
}

export { ROUND_TTL_MS };
