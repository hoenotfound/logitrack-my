// services/routes/src/route-optimizer.ts
/**
 * Route optimization for last-mile delivery
 * Uses OSRM (Open Source Routing Machine) — can self-host for Malaysia OSM data
 * Falls back to Google Maps Directions API for live traffic
 */

const OSRM_BASE = process.env.OSRM_URL ?? "https://router.project-osrm.org";
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

export interface Stop {
  orderId: string;
  lat: number;
  lng: number;
  windowStart?: Date;  // time window open
  windowEnd?: Date;    // time window close
  serviceMinutes?: number; // dwell time
}

export interface OptimizedRoute {
  stops: (Stop & { sequence: number; eta: Date })[];
  totalDistanceKm: number;
  totalDurationMin: number;
  polyline: string;  // encoded
}

/**
 * Solve Travelling Salesman Problem for a driver's stops
 * Uses OSRM table service for distance matrix, then nearest-neighbour heuristic
 */
export async function optimizeRoute(
  origin: { lat: number; lng: number },
  stops: Stop[]
): Promise<OptimizedRoute> {
  if (stops.length === 0) throw new Error("No stops provided");
  if (stops.length === 1) {
    return buildSingleStopRoute(origin, stops[0]);
  }

  // Build coordinates string for OSRM: origin first, then stops
  const allPoints = [origin, ...stops];
  const coordStr = allPoints.map((p) => `${p.lng},${p.lat}`).join(";");

  // Get duration matrix from OSRM
  const tableRes = await fetch(`${OSRM_BASE}/table/v1/driving/${coordStr}?annotations=duration`);
  const tableData = await tableRes.json();
  const durations: number[][] = tableData.durations;

  // Nearest-neighbour greedy TSP from origin (index 0)
  const ordered = nearestNeighbour(durations, stops.length);

  // Build ordered stops with ETAs
  let currentTime = new Date();
  const orderedStops: (Stop & { sequence: number; eta: Date })[] = [];
  let totalDuration = 0;
  let prev = 0; // index 0 is origin

  for (let i = 0; i < ordered.length; i++) {
    const stopIdx = ordered[i] + 1; // +1 because origin is index 0
    const driveDuration = durations[prev][stopIdx]; // seconds
    const serviceDuration = (stops[ordered[i]].serviceMinutes ?? 5) * 60;

    currentTime = new Date(currentTime.getTime() + (driveDuration + serviceDuration) * 1000);
    totalDuration += driveDuration + serviceDuration;

    orderedStops.push({
      ...stops[ordered[i]],
      sequence: i + 1,
      eta: new Date(currentTime),
    });
    prev = stopIdx;
  }

  // Get route geometry
  const routeCoords = [
    `${origin.lng},${origin.lat}`,
    ...ordered.map((i) => `${stops[i].lng},${stops[i].lat}`),
  ].join(";");

  const routeRes = await fetch(
    `${OSRM_BASE}/route/v1/driving/${routeCoords}?overview=simplified&geometries=polyline`
  );
  const routeData = await routeRes.json();
  const route = routeData.routes?.[0];

  return {
    stops: orderedStops,
    totalDistanceKm: route ? route.distance / 1000 : 0,
    totalDurationMin: totalDuration / 60,
    polyline: route?.geometry ?? "",
  };
}

/**
 * Estimate delivery time for a single stop using Google Maps (with traffic)
 */
export async function getETA(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ distanceKm: number; durationMin: number; durationInTrafficMin?: number }> {
  if (!GOOGLE_MAPS_KEY) {
    // Fallback to OSRM
    const res = await fetch(
      `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`
    );
    const data = await res.json();
    const r = data.routes?.[0];
    return { distanceKm: r.distance / 1000, durationMin: r.duration / 60 };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${from.lat},${from.lng}`);
  url.searchParams.set("destination", `${to.lat},${to.lng}`);
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", GOOGLE_MAPS_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();
  const leg = data.routes?.[0]?.legs?.[0];

  return {
    distanceKm: leg.distance.value / 1000,
    durationMin: leg.duration.value / 60,
    durationInTrafficMin: leg.duration_in_traffic?.value / 60,
  };
}

// ─────────────────────────────────────────────
// Nearest-neighbour TSP
// ─────────────────────────────────────────────
function nearestNeighbour(matrix: number[][], nStops: number): number[] {
  const visited = new Set<number>();
  const order: number[] = [];
  let current = 0; // start from origin (row 0)

  for (let i = 0; i < nStops; i++) {
    let nearest = -1;
    let minDist = Infinity;

    for (let j = 1; j <= nStops; j++) {
      if (!visited.has(j - 1) && matrix[current][j] < minDist) {
        minDist = matrix[current][j];
        nearest = j;
      }
    }

    visited.add(nearest - 1);
    order.push(nearest - 1);
    current = nearest;
  }

  return order;
}

async function buildSingleStopRoute(
  origin: { lat: number; lng: number },
  stop: Stop
): Promise<OptimizedRoute> {
  const eta = await getETA(origin, stop);
  return {
    stops: [{ ...stop, sequence: 1, eta: new Date(Date.now() + eta.durationMin * 60000) }],
    totalDistanceKm: eta.distanceKm,
    totalDurationMin: eta.durationMin,
    polyline: "",
  };
}
