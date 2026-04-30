import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import ICAL from "ical.js";
import { decrypt } from "@/lib/crypto";
import type { CalendarAccount } from "@/lib/db/schema";
import {
  isValidIanaTz,
  localPartsToUtc,
  parseFloatingIso,
  utcToLocalParts,
} from "@/lib/caldav-tz";

// Design notes
// ------------
// Events round-trip through ical.js. When a `tz` (IANA name) is supplied on
// create/update, we emit `DTSTART;TZID=<iana>:<local-time>` and rely on
// CalDAV servers (iCloud, Fastmail, Nextcloud) to accept the TZID parameter
// without an inline VTIMEZONE block — every modern server does. On the read
// path we extract TZID from the property parameters and use Intl-based helpers
// (caldav-tz.ts) to compute the true UTC equivalent, which keeps DST
// transitions correct for both single events and expanded occurrences. When no
// tz is supplied, times are stored as UTC (`Z`).
//
// Recurring events return the master + raw RRULE by default. Pass
// expandRecurring=true to have the server walk ICAL.Event#iterator() bounded
// by the requested range; each occurrence's local components are reconverted
// to UTC through the master's TZID.

export type CalendarAccountLike = Pick<
  CalendarAccount,
  "caldavUrl" | "username" | "passwordEnc"
>;

function buildClient(acc: CalendarAccountLike): DAVClient {
  return new DAVClient({
    serverUrl: acc.caldavUrl,
    credentials: {
      username: acc.username,
      password: decrypt(acc.passwordEnc),
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

export async function withDav<T>(
  acc: CalendarAccountLike,
  fn: (client: DAVClient) => Promise<T>,
): Promise<T> {
  const client = buildClient(acc);
  await client.login();
  // tsdav uses ephemeral fetch under the hood — no teardown required.
  return fn(client);
}

export async function testCalDavConnection(
  acc: CalendarAccountLike,
): Promise<{ calendarCount: number }> {
  return withDav(acc, async (client) => {
    const cals = await client.fetchCalendars();
    return { calendarCount: cals.length };
  });
}

export interface CalendarSummary {
  url: string;
  displayName: string | null;
  color: string | null;
  timezone: string | null;
  components: string[];
  ctag: string | null;
}

function calendarSummary(c: DAVCalendar): CalendarSummary {
  const name =
    typeof c.displayName === "string"
      ? c.displayName
      : c.displayName && typeof c.displayName === "object"
        ? // some servers return localized records like { fr: "Calendrier" }
          (Object.values(c.displayName)[0] as string | undefined) ?? null
        : null;
  return {
    url: c.url,
    displayName: name,
    color: c.calendarColor ?? null,
    timezone: c.timezone ?? null,
    components: c.components ?? [],
    ctag: c.ctag ?? null,
  };
}

export async function listCalendars(
  acc: CalendarAccountLike,
): Promise<CalendarSummary[]> {
  return withDav(acc, async (client) => {
    const cals = await client.fetchCalendars();
    return cals.map(calendarSummary);
  });
}

async function findCalendar(
  client: DAVClient,
  calendarUrl: string,
): Promise<DAVCalendar> {
  const cals = await client.fetchCalendars();
  const match = cals.find((c) => normalizeUrl(c.url) === normalizeUrl(calendarUrl));
  if (!match) throw new Error(`Calendar not found: ${calendarUrl}`);
  return match;
}

function normalizeUrl(u: string): string {
  // strip trailing slash for stable matching
  return u.replace(/\/+$/, "");
}

export interface AttendeeOut {
  email: string | null;
  name: string | null;
  role: string | null;
  partstat: string | null;
  rsvp: boolean | null;
}

export interface NormalizedEvent {
  uid: string;
  url: string;
  etag: string | null;
  calendarUrl: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start: string | null;       // UTC ISO
  end: string | null;         // UTC ISO
  startLocal: string | null;  // Wall-clock in `tz` if set, else null
  endLocal: string | null;
  tz: string | null;          // IANA name from TZID, or null when stored as UTC
  allDay: boolean;
  rrule: string | null;
  recurrenceId: string | null;
  organizer: string | null;
  attendees: AttendeeOut[];
  status: string | null;
  sequence: number | null;
  lastModified: string | null;
  created: string | null;
}

export interface ExpandedOccurrence {
  uid: string;
  url: string;
  calendarUrl: string;
  summary: string | null;
  start: string;        // UTC ISO
  end: string;          // UTC ISO
  startLocal: string | null;
  endLocal: string | null;
  tz: string | null;
  allDay: boolean;
  recurrenceId: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function timeToIsoUtc(
  t: ICAL.Time | null | undefined,
  tzid: string | null,
): string | null {
  if (!t) return null;
  try {
    if (tzid && isValidIanaTz(tzid) && !t.isDate) {
      const utc = localPartsToUtc(tzid, {
        year: t.year,
        month: t.month,
        day: t.day,
        hour: t.hour,
        minute: t.minute,
        second: t.second,
      });
      return utc.toISOString();
    }
    return t.toJSDate().toISOString();
  } catch {
    return null;
  }
}

function timeToLocalIso(
  t: ICAL.Time | null | undefined,
  tzid: string | null,
): string | null {
  if (!t) return null;
  if (!tzid || t.isDate) return null;
  return (
    `${t.year}-${pad2(t.month)}-${pad2(t.day)}T` +
    `${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}`
  );
}

function readTzid(prop: ICAL.Property | null | undefined): string | null {
  if (!prop) return null;
  const tz = prop.getParameter("tzid") as string | undefined;
  return tz && isValidIanaTz(tz) ? tz : null;
}

function readAttendees(component: ICAL.Component): AttendeeOut[] {
  const props = component.getAllProperties("attendee");
  return props.map((p) => {
    const value = p.getFirstValue();
    const cal =
      typeof value === "string"
        ? value
        : value && typeof (value as { toString?: () => string }).toString === "function"
          ? String(value)
          : "";
    const email = cal.toLowerCase().startsWith("mailto:") ? cal.slice(7) : cal || null;
    return {
      email,
      name: (p.getParameter("cn") as string | undefined) ?? null,
      role: (p.getParameter("role") as string | undefined) ?? null,
      partstat: (p.getParameter("partstat") as string | undefined) ?? null,
      rsvp:
        (p.getParameter("rsvp") as string | undefined)?.toUpperCase() === "TRUE"
          ? true
          : (p.getParameter("rsvp") as string | undefined)?.toUpperCase() === "FALSE"
            ? false
            : null,
    };
  });
}

function readOrganizer(component: ICAL.Component): string | null {
  const p = component.getFirstProperty("organizer");
  if (!p) return null;
  const v = p.getFirstValue();
  const s = typeof v === "string" ? v : String(v ?? "");
  return s.toLowerCase().startsWith("mailto:") ? s.slice(7) : s || null;
}

function parseVCalendar(data: string): ICAL.Component {
  const jcal = ICAL.parse(data);
  return new ICAL.Component(jcal);
}

function findVEvent(comp: ICAL.Component): ICAL.Component | null {
  // Pick the master event (no RECURRENCE-ID) when present.
  const events = comp.getAllSubcomponents("vevent");
  if (events.length === 0) return null;
  const master = events.find((e) => !e.getFirstProperty("recurrence-id"));
  return master ?? events[0];
}

function normalizeFromObject(
  obj: DAVCalendarObject,
  calendarUrl: string,
): NormalizedEvent | null {
  const data = typeof obj.data === "string" ? obj.data : null;
  if (!data) return null;
  let comp: ICAL.Component;
  try {
    comp = parseVCalendar(data);
  } catch {
    return null;
  }
  const vevent = findVEvent(comp);
  if (!vevent) return null;
  const event = new ICAL.Event(vevent);
  const startProp = vevent.getFirstProperty("dtstart");
  const endProp = vevent.getFirstProperty("dtend");
  const allDay = startProp
    ? (startProp.getParameter("value") as string | undefined)?.toUpperCase() === "DATE" ||
      event.startDate?.isDate === true
    : false;
  const tzid = readTzid(startProp);
  const rruleProp = vevent.getFirstProperty("rrule");
  const rrule = rruleProp ? rruleProp.getFirstValue()?.toString() ?? null : null;
  const recurrenceProp = vevent.getFirstProperty("recurrence-id");
  const recurrenceId = recurrenceProp
    ? timeToIsoUtc(event.recurrenceId, readTzid(recurrenceProp) ?? tzid)
    : null;
  const sequenceVal = vevent.getFirstPropertyValue("sequence");
  const lastMod = vevent.getFirstProperty("last-modified");
  const created = vevent.getFirstProperty("created");
  return {
    uid: event.uid ?? "",
    url: obj.url,
    etag: obj.etag ?? null,
    calendarUrl,
    summary: event.summary ?? null,
    description: event.description ?? null,
    location: event.location ?? null,
    start: timeToIsoUtc(event.startDate, tzid),
    end: timeToIsoUtc(event.endDate, readTzid(endProp) ?? tzid),
    startLocal: timeToLocalIso(event.startDate, tzid),
    endLocal: timeToLocalIso(event.endDate, readTzid(endProp) ?? tzid),
    tz: tzid,
    allDay,
    rrule,
    recurrenceId,
    organizer: readOrganizer(vevent),
    attendees: readAttendees(vevent),
    status: (vevent.getFirstPropertyValue("status") as string | null) ?? null,
    sequence: typeof sequenceVal === "number" ? sequenceVal : null,
    lastModified: lastMod
      ? timeToIsoUtc(lastMod.getFirstValue() as ICAL.Time, null)
      : null,
    created: created ? timeToIsoUtc(created.getFirstValue() as ICAL.Time, null) : null,
  };
}

function timeAsUtcDate(t: ICAL.Time, tzid: string | null): Date {
  if (tzid && isValidIanaTz(tzid) && !t.isDate) {
    return localPartsToUtc(tzid, {
      year: t.year,
      month: t.month,
      day: t.day,
      hour: t.hour,
      minute: t.minute,
      second: t.second,
    });
  }
  return t.toJSDate();
}

function timeAsLocalIso(t: ICAL.Time, tzid: string | null): string | null {
  if (!tzid || t.isDate) return null;
  return (
    `${t.year}-${pad2(t.month)}-${pad2(t.day)}T` +
    `${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}`
  );
}

function expandOccurrences(
  obj: DAVCalendarObject,
  calendarUrl: string,
  rangeStart: Date,
  rangeEnd: Date,
  cap = 500,
): ExpandedOccurrence[] {
  const data = typeof obj.data === "string" ? obj.data : null;
  if (!data) return [];
  let comp: ICAL.Component;
  try {
    comp = parseVCalendar(data);
  } catch {
    return [];
  }
  const vevent = findVEvent(comp);
  if (!vevent) return [];
  const event = new ICAL.Event(vevent);
  const startProp = vevent.getFirstProperty("dtstart");
  const endProp = vevent.getFirstProperty("dtend");
  const tzid = readTzid(startProp);
  const endTzid = readTzid(endProp) ?? tzid;
  const out: ExpandedOccurrence[] = [];
  if (!event.isRecurring()) {
    if (!event.startDate || !event.endDate) return [];
    const start = timeAsUtcDate(event.startDate, tzid);
    const end = timeAsUtcDate(event.endDate, endTzid);
    if (end <= rangeStart || start >= rangeEnd) return [];
    out.push({
      uid: event.uid ?? "",
      url: obj.url,
      calendarUrl,
      summary: event.summary ?? null,
      start: start.toISOString(),
      end: end.toISOString(),
      startLocal: timeAsLocalIso(event.startDate, tzid),
      endLocal: timeAsLocalIso(event.endDate, endTzid),
      tz: tzid,
      allDay: event.startDate.isDate === true,
      recurrenceId: start.toISOString(),
    });
    return out;
  }
  const iterator = event.iterator();
  let next = iterator.next();
  let count = 0;
  while (next && count < cap) {
    const occStart = timeAsUtcDate(next, tzid);
    if (occStart >= rangeEnd) break;
    const details = event.getOccurrenceDetails(next);
    const occEnd = timeAsUtcDate(details.endDate, endTzid);
    if (occEnd > rangeStart) {
      out.push({
        uid: event.uid ?? "",
        url: obj.url,
        calendarUrl,
        summary: details.item.summary ?? null,
        start: occStart.toISOString(),
        end: occEnd.toISOString(),
        startLocal: timeAsLocalIso(next, tzid),
        endLocal: timeAsLocalIso(details.endDate, endTzid),
        tz: tzid,
        allDay: details.startDate.isDate === true,
        recurrenceId: occStart.toISOString(),
      });
    }
    next = iterator.next();
    count += 1;
  }
  return out;
}

export interface ListEventsOptions {
  calendarUrl: string;
  timeMin: Date;
  timeMax: Date;
  expandRecurring?: boolean;
}

export interface ListEventsResult {
  events: NormalizedEvent[];
  occurrences?: ExpandedOccurrence[];
}

export async function listEvents(
  acc: CalendarAccountLike,
  opts: ListEventsOptions,
): Promise<ListEventsResult> {
  return withDav(acc, async (client) => {
    const calendar = await findCalendar(client, opts.calendarUrl);
    const objects = await client.fetchCalendarObjects({
      calendar,
      timeRange: {
        start: opts.timeMin.toISOString(),
        end: opts.timeMax.toISOString(),
      },
    });
    const events: NormalizedEvent[] = [];
    for (const o of objects) {
      const n = normalizeFromObject(o, opts.calendarUrl);
      if (n) events.push(n);
    }
    if (!opts.expandRecurring) return { events };
    const occurrences: ExpandedOccurrence[] = [];
    for (const o of objects) {
      occurrences.push(
        ...expandOccurrences(o, opts.calendarUrl, opts.timeMin, opts.timeMax),
      );
    }
    return { events, occurrences };
  });
}

export interface GetEventResult {
  event: NormalizedEvent;
  raw: string;
}

export async function getEvent(
  acc: CalendarAccountLike,
  calendarUrl: string,
  eventUrl: string,
): Promise<GetEventResult | null> {
  return withDav(acc, async (client) => {
    const calendar = await findCalendar(client, calendarUrl);
    const objects = await client.fetchCalendarObjects({
      calendar,
      objectUrls: [eventUrl],
    });
    const obj = objects[0];
    if (!obj) return null;
    const n = normalizeFromObject(obj, calendarUrl);
    if (!n) return null;
    return { event: n, raw: typeof obj.data === "string" ? obj.data : "" };
  });
}

export interface AttendeeIn {
  email: string;
  name?: string;
  role?: string;
  rsvp?: boolean;
}

export interface ReminderIn {
  minutesBefore: number;
  action?: "DISPLAY" | "EMAIL" | "AUDIO";
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  tz?: string;
  attendees?: AttendeeIn[];
  organizerEmail?: string;
  rrule?: string;
  reminders?: ReminderIn[];
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
}

interface ParsedTime {
  time: ICAL.Time;
  tzid: string | null;
}

// Parse user-supplied ISO 8601 (or YYYY-MM-DD for all-day) into an ICAL.Time.
//   - allDay: emits a DATE value (no time, no timezone).
//   - tz given:
//       * floating ISO ("2026-05-01T10:00:00")  → local time in tz
//       * zoned ISO ("2026-05-01T10:00:00Z" or "+02:00") → converted to tz local
//     Resulting Time carries tz wall-clock components and tzid is returned so
//     the caller can set the TZID parameter on the property.
//   - no tz: stored as UTC (`Z`).
function parseDateInput(iso: string, allDay: boolean, tz?: string): ParsedTime {
  if (allDay) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) throw new Error(`Invalid date: ${iso}`);
    return {
      time: ICAL.Time.fromData({
        year: Number(m[1]),
        month: Number(m[2]),
        day: Number(m[3]),
        isDate: true,
      }),
      tzid: null,
    };
  }

  if (tz) {
    if (!isValidIanaTz(tz)) throw new Error(`Invalid IANA timezone: ${tz}`);
    const floating = parseFloatingIso(iso);
    let parts;
    if (floating) {
      parts = floating;
    } else {
      const utc = new Date(iso);
      if (Number.isNaN(utc.getTime())) throw new Error(`Invalid date: ${iso}`);
      parts = utcToLocalParts(tz, utc);
    }
    return {
      time: ICAL.Time.fromData({
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
        isDate: false,
      }),
      tzid: tz,
    };
  }

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return { time: ICAL.Time.fromJSDate(d, /* useUTC */ true), tzid: null };
}

function buildVEvent(input: CreateEventInput, uid: string): ICAL.Component {
  const vevent = new ICAL.Component("vevent");
  vevent.addPropertyWithValue("uid", uid);
  vevent.addPropertyWithValue("summary", input.summary);
  if (input.description) vevent.addPropertyWithValue("description", input.description);
  if (input.location) vevent.addPropertyWithValue("location", input.location);

  const allDay = input.allDay === true;
  const dtstart = parseDateInput(input.start, allDay, input.tz);
  const dtend = parseDateInput(input.end, allDay, input.tz);
  const dtstartProp = new ICAL.Property("dtstart");
  const dtendProp = new ICAL.Property("dtend");
  if (allDay) {
    dtstartProp.setParameter("value", "DATE");
    dtendProp.setParameter("value", "DATE");
  }
  if (dtstart.tzid) dtstartProp.setParameter("tzid", dtstart.tzid);
  if (dtend.tzid) dtendProp.setParameter("tzid", dtend.tzid);
  dtstartProp.setValue(dtstart.time);
  dtendProp.setValue(dtend.time);
  vevent.addProperty(dtstartProp);
  vevent.addProperty(dtendProp);

  vevent.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  vevent.addPropertyWithValue("created", ICAL.Time.fromJSDate(new Date(), true));
  vevent.addPropertyWithValue("last-modified", ICAL.Time.fromJSDate(new Date(), true));
  vevent.addPropertyWithValue("sequence", 0);

  if (input.status) vevent.addPropertyWithValue("status", input.status);
  if (input.rrule) {
    const recur = ICAL.Recur.fromString(input.rrule);
    vevent.addPropertyWithValue("rrule", recur);
  }
  if (input.organizerEmail) {
    vevent.addPropertyWithValue("organizer", `mailto:${input.organizerEmail}`);
  }
  for (const att of input.attendees ?? []) {
    const p = new ICAL.Property("attendee");
    p.setValue(`mailto:${att.email}`);
    if (att.name) p.setParameter("cn", att.name);
    if (att.role) p.setParameter("role", att.role);
    if (att.rsvp !== undefined) p.setParameter("rsvp", att.rsvp ? "TRUE" : "FALSE");
    p.setParameter("partstat", "NEEDS-ACTION");
    vevent.addProperty(p);
  }
  for (const rem of input.reminders ?? []) {
    const valarm = new ICAL.Component("valarm");
    valarm.addPropertyWithValue("action", rem.action ?? "DISPLAY");
    valarm.addPropertyWithValue("description", input.summary);
    const trigger = new ICAL.Property("trigger");
    trigger.setValue(ICAL.Duration.fromSeconds(-rem.minutesBefore * 60));
    valarm.addProperty(trigger);
    vevent.addSubcomponent(valarm);
  }
  return vevent;
}

function wrapInVCalendar(vevent: ICAL.Component): string {
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("prodid", "-//imap-mcp//caldav//EN");
  cal.updatePropertyWithValue("version", "2.0");
  cal.addSubcomponent(vevent);
  return cal.toString();
}

export interface CreateEventResult {
  url: string;
  etag: string | null;
  uid: string;
}

export async function createEvent(
  acc: CalendarAccountLike,
  calendarUrl: string,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const uid = `${cryptoRandom()}@imap-mcp`;
  const vevent = buildVEvent(input, uid);
  const iCalString = wrapInVCalendar(vevent);
  return withDav(acc, async (client) => {
    const calendar = await findCalendar(client, calendarUrl);
    const res = await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });
    if (!res.ok) {
      throw new Error(`createCalendarObject failed: ${res.status} ${res.statusText}`);
    }
    const url = res.headers.get("location") ??
      `${normalizeUrl(calendarUrl)}/${uid}.ics`;
    const etag = res.headers.get("etag");
    return { url, etag, uid };
  });
}

function cryptoRandom(): string {
  return globalThis.crypto.randomUUID();
}

export interface UpdateEventPatch {
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: string;
  end?: string;
  allDay?: boolean;
  tz?: string | null;
  attendees?: AttendeeIn[];
  rrule?: string | null;
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
}

function applyPatch(vevent: ICAL.Component, patch: UpdateEventPatch): void {
  if (patch.summary !== undefined) {
    vevent.updatePropertyWithValue("summary", patch.summary);
  }
  if (patch.description !== undefined) {
    vevent.removeAllProperties("description");
    if (patch.description) vevent.addPropertyWithValue("description", patch.description);
  }
  if (patch.location !== undefined) {
    vevent.removeAllProperties("location");
    if (patch.location) vevent.addPropertyWithValue("location", patch.location);
  }
  if (
    patch.start !== undefined ||
    patch.end !== undefined ||
    patch.allDay !== undefined ||
    patch.tz !== undefined
  ) {
    const currentStart = vevent.getFirstProperty("dtstart");
    const currentEnd = vevent.getFirstProperty("dtend");
    const currentAllDay =
      patch.allDay !== undefined
        ? patch.allDay
        : (currentStart?.getParameter("value") as string | undefined)?.toUpperCase() === "DATE";
    // Resolve effective tz: explicit patch wins, else preserve existing TZID,
    // unless the patch sets tz=null which means "switch to UTC".
    const existingTzid = readTzid(currentStart);
    const effectiveTz =
      patch.tz === undefined ? existingTzid : patch.tz === null ? undefined : patch.tz;

    function rewriteProp(name: "dtstart" | "dtend", iso: string | undefined, current: ICAL.Property | null) {
      // If iso isn't supplied, but tz/allDay changed, we still rewrite to apply
      // the new TZID/VALUE consistently. Reuse the existing local components.
      let parsed: ParsedTime | null = null;
      if (iso !== undefined) {
        parsed = parseDateInput(iso, currentAllDay, effectiveTz ?? undefined);
      } else if (current) {
        const v = current.getFirstValue() as ICAL.Time | undefined;
        if (v) {
          if (currentAllDay) {
            parsed = {
              time: ICAL.Time.fromData({
                year: v.year,
                month: v.month,
                day: v.day,
                isDate: true,
              }),
              tzid: null,
            };
          } else if (effectiveTz) {
            // existing local components in the new tz (or unchanged tz)
            parsed = {
              time: ICAL.Time.fromData({
                year: v.year,
                month: v.month,
                day: v.day,
                hour: v.hour,
                minute: v.minute,
                second: v.second,
                isDate: false,
              }),
              tzid: effectiveTz,
            };
          } else {
            // switch to UTC: re-anchor using the existing TZID
            const utc = existingTzid
              ? localPartsToUtc(existingTzid, {
                  year: v.year,
                  month: v.month,
                  day: v.day,
                  hour: v.hour,
                  minute: v.minute,
                  second: v.second,
                })
              : v.toJSDate();
            parsed = {
              time: ICAL.Time.fromJSDate(utc, true),
              tzid: null,
            };
          }
        }
      }
      if (!parsed) return;
      vevent.removeAllProperties(name);
      const p = new ICAL.Property(name);
      if (currentAllDay) p.setParameter("value", "DATE");
      if (parsed.tzid) p.setParameter("tzid", parsed.tzid);
      p.setValue(parsed.time);
      vevent.addProperty(p);
    }

    rewriteProp("dtstart", patch.start, currentStart);
    rewriteProp("dtend", patch.end, currentEnd);
  }
  if (patch.attendees !== undefined) {
    vevent.removeAllProperties("attendee");
    for (const att of patch.attendees) {
      const p = new ICAL.Property("attendee");
      p.setValue(`mailto:${att.email}`);
      if (att.name) p.setParameter("cn", att.name);
      if (att.role) p.setParameter("role", att.role);
      if (att.rsvp !== undefined) p.setParameter("rsvp", att.rsvp ? "TRUE" : "FALSE");
      p.setParameter("partstat", "NEEDS-ACTION");
      vevent.addProperty(p);
    }
  }
  if (patch.rrule !== undefined) {
    vevent.removeAllProperties("rrule");
    if (patch.rrule) {
      const recur = ICAL.Recur.fromString(patch.rrule);
      vevent.addPropertyWithValue("rrule", recur);
    }
  }
  if (patch.status !== undefined) {
    vevent.updatePropertyWithValue("status", patch.status);
  }
  // Bump sequence + last-modified per RFC 5545.
  const currentSeq = vevent.getFirstPropertyValue("sequence");
  const seq = typeof currentSeq === "number" ? currentSeq + 1 : 1;
  vevent.updatePropertyWithValue("sequence", seq);
  vevent.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(new Date(), true));
  vevent.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
}

export interface UpdateEventResult {
  url: string;
  etag: string | null;
}

export async function updateEvent(
  acc: CalendarAccountLike,
  calendarUrl: string,
  eventUrl: string,
  etag: string,
  patch: UpdateEventPatch,
): Promise<UpdateEventResult> {
  return withDav(acc, async (client) => {
    const calendar = await findCalendar(client, calendarUrl);
    const objects = await client.fetchCalendarObjects({
      calendar,
      objectUrls: [eventUrl],
    });
    const obj = objects[0];
    if (!obj || typeof obj.data !== "string") {
      throw new Error("event not found");
    }
    const comp = parseVCalendar(obj.data);
    const vevent = findVEvent(comp);
    if (!vevent) throw new Error("VEVENT not found in calendar object");
    applyPatch(vevent, patch);
    const newData = comp.toString();
    const res = await client.updateCalendarObject({
      calendarObject: { url: eventUrl, etag, data: newData },
    });
    if (!res.ok) {
      if (res.status === 412) {
        throw new Error(
          `412 Precondition Failed — etag is stale; re-fetch the event and retry`,
        );
      }
      throw new Error(`updateCalendarObject failed: ${res.status} ${res.statusText}`);
    }
    return { url: eventUrl, etag: res.headers.get("etag") };
  });
}

export async function deleteEvent(
  acc: CalendarAccountLike,
  eventUrl: string,
  etag?: string,
): Promise<{ ok: true }> {
  return withDav(acc, async (client) => {
    const res = await client.deleteCalendarObject({
      calendarObject: { url: eventUrl, etag: etag ?? "", data: "" },
    });
    if (!res.ok) {
      if (res.status === 412) {
        throw new Error(
          `412 Precondition Failed — etag is stale; re-fetch the event and retry`,
        );
      }
      throw new Error(`deleteCalendarObject failed: ${res.status} ${res.statusText}`);
    }
    return { ok: true as const };
  });
}

export interface WorkHours {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  tz?: string;   // IANA — V1 uses UTC offsets via Date local methods; tz purely informational
  days?: number[]; // 0-6 (Sunday-Saturday); defaults to Mon-Fri
}

export interface FindFreeSlotsOptions {
  calendarUrls: string[];
  timeMin: Date;
  timeMax: Date;
  durationMinutes: number;
  workHours?: WorkHours;
}

export interface FreeSlot {
  start: string;
  end: string;
}

interface BusyInterval {
  start: number;
  end: number;
}

function mergeIntervals(arr: BusyInterval[]): BusyInterval[] {
  if (arr.length === 0) return [];
  const sorted = [...arr].sort((a, b) => a.start - b.start);
  const out: BusyInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function clampToWorkHours(
  free: BusyInterval[],
  rangeStart: number,
  rangeEnd: number,
  wh: WorkHours,
): BusyInterval[] {
  const days = wh.days ?? [1, 2, 3, 4, 5];
  const [sh, sm] = wh.start.split(":").map((x) => Number(x));
  const [eh, em] = wh.end.split(":").map((x) => Number(x));
  const tz = wh.tz && isValidIanaTz(wh.tz) ? wh.tz : null;
  const out: BusyInterval[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  // Step day-by-day in the work-hours timezone (or UTC when none) so DST
  // transitions don't drift the working window.
  if (tz) {
    // Anchor to local midnight on the day containing rangeStart.
    const startLocal = utcToLocalParts(tz, new Date(rangeStart));
    let cursorUtc = localPartsToUtc(tz, {
      year: startLocal.year,
      month: startLocal.month,
      day: startLocal.day,
      hour: 0,
      minute: 0,
      second: 0,
    }).getTime();
    while (cursorUtc < rangeEnd) {
      const lp = utcToLocalParts(tz, new Date(cursorUtc));
      // Day-of-week in the local timezone — derive via a UTC-anchored Date.
      const dow = new Date(Date.UTC(lp.year, lp.month - 1, lp.day)).getUTCDay();
      if (days.includes(dow)) {
        const ws = localPartsToUtc(tz, {
          year: lp.year, month: lp.month, day: lp.day,
          hour: sh, minute: sm, second: 0,
        }).getTime();
        const we = localPartsToUtc(tz, {
          year: lp.year, month: lp.month, day: lp.day,
          hour: eh, minute: em, second: 0,
        }).getTime();
        for (const f of free) {
          const a = Math.max(f.start, ws, rangeStart);
          const b = Math.min(f.end, we, rangeEnd);
          if (b > a) out.push({ start: a, end: b });
        }
      }
      cursorUtc += dayMs;
    }
    return out;
  }

  // No tz: interpret hours as UTC.
  const startDay = new Date(rangeStart);
  startDay.setUTCHours(0, 0, 0, 0);
  for (let t = startDay.getTime(); t < rangeEnd; t += dayMs) {
    const d = new Date(t);
    if (!days.includes(d.getUTCDay())) continue;
    const ws = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sh, sm);
    const we = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), eh, em);
    for (const f of free) {
      const a = Math.max(f.start, ws, rangeStart);
      const b = Math.min(f.end, we, rangeEnd);
      if (b > a) out.push({ start: a, end: b });
    }
  }
  return out;
}

export async function findFreeSlots(
  acc: CalendarAccountLike,
  opts: FindFreeSlotsOptions,
): Promise<FreeSlot[]> {
  const busy: BusyInterval[] = [];
  for (const url of opts.calendarUrls) {
    const { occurrences } = await listEvents(acc, {
      calendarUrl: url,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      expandRecurring: true,
    });
    for (const o of occurrences ?? []) {
      busy.push({
        start: new Date(o.start).getTime(),
        end: new Date(o.end).getTime(),
      });
    }
  }
  const merged = mergeIntervals(busy);
  const rangeStart = opts.timeMin.getTime();
  const rangeEnd = opts.timeMax.getTime();
  const free: BusyInterval[] = [];
  let cursor = rangeStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, rangeEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= rangeEnd) break;
  }
  if (cursor < rangeEnd) free.push({ start: cursor, end: rangeEnd });

  const constrained = opts.workHours
    ? clampToWorkHours(free, rangeStart, rangeEnd, opts.workHours)
    : free;
  const minMs = opts.durationMinutes * 60 * 1000;
  return constrained
    .filter((f) => f.end - f.start >= minMs)
    .map((f) => ({
      start: new Date(f.start).toISOString(),
      end: new Date(f.end).toISOString(),
    }));
}
