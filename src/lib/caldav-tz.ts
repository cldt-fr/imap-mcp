// Minimal IANA-timezone helpers built on Intl.DateTimeFormat.
// We deliberately avoid bundling tzdata or registering ical.js TimezoneService:
// every event mutation goes through these helpers to convert between local
// wall-clock components and UTC instants. This is enough for correct:
//   - storage of events with `TZID=<iana>` (CalDAV servers like iCloud, Fastmail
//     and Nextcloud accept the TZID parameter without an inline VTIMEZONE block),
//   - DST-aware recurrence expansion (each occurrence's local components are
//     converted independently),
//   - working-hours filtering across DST boundaries.

export function isValidIanaTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let cached = partsCache.get(tz);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsCache.set(tz, cached);
  }
  return cached;
}

export function utcToLocalParts(tz: string, utc: Date): LocalParts {
  const parts = fmt(tz).formatToParts(utc);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  // Intl can return "24" for midnight in some locales — normalize to 0.
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Offset (in minutes) of `tz` at the given UTC instant: localTime - utcTime.
export function getOffsetMinutes(tz: string, utc: Date): number {
  const lp = utcToLocalParts(tz, utc);
  const localAsIfUtc = Date.UTC(
    lp.year,
    lp.month - 1,
    lp.day,
    lp.hour,
    lp.minute,
    lp.second,
  );
  return Math.round((localAsIfUtc - utc.getTime()) / 60000);
}

// Convert a wall-clock time in `tz` to a UTC Date.
export function localPartsToUtc(tz: string, lp: LocalParts): Date {
  // Treat the local time as UTC, then correct by the actual tz offset.
  // Iterate twice to land on the right side of DST transitions.
  const naive = Date.UTC(
    lp.year,
    lp.month - 1,
    lp.day,
    lp.hour,
    lp.minute,
    lp.second,
  );
  let date = new Date(naive);
  for (let i = 0; i < 2; i++) {
    const offset = getOffsetMinutes(tz, date);
    date = new Date(naive - offset * 60000);
  }
  return date;
}

// Parse the local components from an ISO 8601 string when no timezone
// information is present. Returns null if the string carries an offset (Z or
// ±HH:MM) — the caller should then treat it as a UTC instant.
export function parseFloatingIso(iso: string): LocalParts | null {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return null;
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
  };
}
