// lib/report/demo-data.ts
// Deterministic, entirely fictional data for a demo agency: 6 properties and ~40 enquiries over
// 30 days. Used by scripts/seed-demo.ts (to fill a real database for screenshots and the Loom)
// and by the tests. Names are made up, e-mails use example.com and phones use Ofcom's reserved
// drama range (07700 900xxx), so nothing here can reach a real person.
import { londonMidnight, londonParts, addDays } from '@/lib/dates';
import type { LeadStatus } from '@/types';
import type { ReportCalendarRow, ReportInboundRow, ReportLeadRow } from '@/lib/report/model';

/** The one agency the demo seed may create or delete. Also excluded from the owner's ops summary. */
export const DEMO_SLUG = 'demo-lettings';

export interface DemoProperty {
  id: string;
  address: string;
  reference: string;
  portal_listing_id: string;
  monthly_rent: number;
}

export interface DemoLead extends ReportLeadRow {
  annual_income: number | null;
  has_right_to_rent: boolean | null;
  has_no_ccj: boolean | null;
  move_in_date: string | null;
  cal_booking_uid: string | null;
}

export interface DemoInbound extends ReportInboundRow {
  from_address: string;
  subject: string;
}

export interface DemoData {
  properties: DemoProperty[];
  leads: DemoLead[];
  inbound: DemoInbound[];
  calendarEvents: ReportCalendarRow[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Amira', 'Daniel', 'Priya', 'Tom', 'Chloe', 'Kwame', 'Sofia', 'Liam', 'Hannah', 'Mateo', 'Aisha', 'Oliver', 'Zainab', 'Jack', 'Elena', 'Ravi', 'Grace', 'Noah', 'Mei', 'Callum', 'Fatima', 'Ben', 'Isla', 'Yusuf', 'Ruth', 'Marek', 'Leila', 'Harry', 'Nia', 'Omar'];
const LAST = ['Hassan', 'Okafor', 'Patel', 'Walker', 'Nguyen', 'Mensah', 'Rossi', 'Murphy', 'Clarke', 'Silva', 'Khan', 'Brooks', 'Ahmed', 'Taylor', 'Novak', 'Sharma', 'Evans', 'Adeyemi', 'Lin', 'Reid', 'Ali', 'Foster', 'Campbell', 'Demir', 'Hughes', 'Kowalski', 'Haddad', 'Wood', 'Jones', 'Farouk'];

const PROPERTIES: Array<Omit<DemoProperty, 'id'>> = [
  { address: 'Flat 4, 12 Clapham Common South Side, London SW4', reference: 'DEMO-0101', portal_listing_id: '160000101', monthly_rent: 2000 },
  { address: 'Flat 5, 12 Clapham Common South Side, London SW4', reference: 'DEMO-0102', portal_listing_id: '160000102', monthly_rent: 2150 },
  { address: '27 Brixton Road, London SW9', reference: 'DEMO-0103', portal_listing_id: '160000103', monthly_rent: 1850 },
  { address: '8 Acre Lane, London SW2', reference: 'DEMO-0104', portal_listing_id: '160000104', monthly_rent: 1650 },
  { address: 'Flat 2, 41 Streatham High Road, London SW16', reference: 'DEMO-0105', portal_listing_id: '160000105', monthly_rent: 1500 },
  { address: '3 Tulse Hill Mews, London SW2', reference: 'DEMO-0106', portal_listing_id: '160000106', monthly_rent: 2400 },
];

// A viewing slot: a half-hour between 10:00 and 17:30 London time, never on a Sunday
function viewingSlot(fromMs: number, daysAhead: number, minuteStep = 0): number {
  let date = addDays(londonParts(new Date(fromMs)).date, daysAhead);
  if (londonParts(londonMidnight(date)).weekday === 0) date = addDays(date, 1);
  return londonMidnight(date).getTime() + (10 * 60 + minuteStep * 30) * 60000;
}

export function generateDemoData(now: Date, seed = 7): DemoData {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const uuid = () => {
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');
    return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[int(0, 3)]}${hex(3)}-${hex(12)}`;
  };
  const nowMs = now.getTime();
  const iso = (ms: number) => new Date(Math.min(ms, nowMs)).toISOString();

  const properties: DemoProperty[] = PROPERTIES.map((p) => ({ id: uuid(), ...p }));
  const today = londonParts(now).date;

  const leads: DemoLead[] = [];
  const inbound: DemoInbound[] = [];
  const usedNames = new Set<string>();
  let phoneCounter = 100;

  const total = 40;
  for (let i = 0; i < total; i++) {
    // the awkward cases are recent, as they would be in real life
    const unmatched = i === 11 || i === 23 || i === 34;
    const failedInvite = i === 38;

    // when the enquiry arrived: a London wall-clock time, about half of them out of hours
    const dayOffset = i < 4 ? 0 : unmatched || failedInvite ? int(0, 2) : int(0, 29);
    const outOfHours = rand() < 0.52;
    const hour = outOfHours ? pick([18, 19, 20, 21, 22, 23, 6, 7, 8]) : int(9, 17);
    const base = londonMidnight(addDays(today, -dayOffset)).getTime();
    let receivedMs = base + (hour * 60 + int(0, 59)) * 60000 + int(0, 59) * 1000;
    if (receivedMs > nowMs - 90_000) receivedMs = nowMs - int(120, 3600) * 1000;

    // a unique, fictional person
    let first: string, last: string;
    do {
      first = pick(FIRST);
      last = pick(LAST);
    } while (usedNames.has(`${first} ${last}`));
    usedNames.add(`${first} ${last}`);
    const email = `${first}.${last}@example.com`.toLowerCase();
    const phone = rand() < 0.85 ? `07700 900${String(phoneCounter++).slice(-3)}` : null;

    const property = unmatched ? null : pick(properties);

    const emailId = `demo-email-${String(i + 1).padStart(3, '0')}`;
    const replyDelay = int(5, 22) * 1000;
    const inboundMs = receivedMs - int(3, 9) * 1000;
    const invitedMs = unmatched ? null : receivedMs + replyDelay - 3000;

    const lead: DemoLead = {
      id: uuid(),
      created_at: iso(receivedMs),
      status: 'PENDING',
      tenant_name: `${first} ${last}`,
      tenant_email: email,
      tenant_phone: phone,
      property_id: property?.id ?? null,
      raw_property_ref: unmatched ? pick(['14 Elmfield Gardens, London SW17', '2 Dalyell Road, SW9', 'Flat 9, Ferndale Court']) : property!.address,
      source_email_id: emailId,
      invitation_sent_at: invitedMs ? iso(invitedMs) : null,
      invitation_error: null,
      screened_at: null,
      booked_at: null,
      viewing_starts_at: null,
      failure_codes: null,
      review_reason: unmatched ? 'property_not_matched' : null,
      annual_income: null,
      has_right_to_rent: null,
      has_no_ccj: null,
      move_in_date: null,
      cal_booking_uid: null,
    };

    inbound.push({
      resend_email_id: emailId,
      created_at: iso(inboundMs),
      status: unmatched ? 'NEEDS_REVIEW' : 'PROCESSED',
      reason: unmatched ? 'property_not_matched' : null,
      lead_id: lead.id,
      from_address: 'autoresponder@rightmove.com',
      subject: `Lettings enquiry: ${lead.raw_property_ref}`,
    });

    if (unmatched) {
      lead.status = 'NEEDS_REVIEW';
    } else if (failedInvite) {
      // the one invitation that failed to send
      lead.invitation_sent_at = null;
      lead.invitation_error = 'Domain is not verified';
    } else {
      const ageDays = (nowMs - receivedMs) / 86_400_000;
      const completes = ageDays < 1 ? rand() < 0.45 : rand() < 0.8;
      if (completes) {
        const screenedMs = (invitedMs ?? receivedMs) + int(2, 18 * 60) * 60000;
        const rent = property!.monthly_rent;
        const ok = rand() >= 0.4;
        lead.screened_at = iso(screenedMs);
        lead.move_in_date = addDays(today, int(5, 60));
        lead.has_right_to_rent = true;
        lead.has_no_ccj = true;
        lead.annual_income = Math.round((rent * 30 * (ok ? 1 + rand() * 0.6 : 0.5 + rand() * 0.45)) / 500) * 500;
        const codes: string[] = [];
        if (!ok) {
          const r = rand();
          if (r < 0.62) codes.push('INCOME_BELOW_THRESHOLD');
          else if (r < 0.87) { codes.push('ADVERSE_CREDIT'); lead.has_no_ccj = false; lead.annual_income = rent * 36; }
          else { codes.push('NO_RIGHT_TO_RENT'); lead.has_right_to_rent = false; lead.annual_income = rent * 34; }
        }
        lead.failure_codes = codes;
        const status: LeadStatus = ok ? 'QUALIFIED' : 'DISQUALIFIED';
        lead.status = status;
        if (ok && rand() < (ageDays > 6 ? 0.8 : 0.4)) {
          const bookedMs = screenedMs + int(1, 36 * 60) * 60000;
          if (bookedMs < nowMs) {
            lead.status = 'BOOKED';
            lead.booked_at = iso(bookedMs);
            lead.viewing_starts_at = new Date(viewingSlot(bookedMs, int(1, 6), int(0, 15))).toISOString();
            lead.cal_booking_uid = `demo-booking-${i + 1}`;
          }
        }
      }
    }
    leads.push(lead);
  }

  // an email we could not read at all
  inbound.push({
    resend_email_id: 'demo-email-unreadable-1',
    created_at: new Date(nowMs - 2 * 86_400_000 - 5 * 3_600_000).toISOString(),
    status: 'NEEDS_REVIEW',
    reason: 'extraction_failed',
    lead_id: null,
    from_address: 'autoresponder@rightmove.com',
    subject: 'Lettings enquiry: property details',
  });

  const calendarEvents: ReportCalendarRow[] = [
    { trigger_event: 'BOOKING_CREATED', status: 'REJECTED', reason: 'lead_not_qualified', created_at: new Date(nowMs - 3 * 86_400_000).toISOString() },
    { trigger_event: 'BOOKING_CREATED', status: 'NO_MATCH', reason: 'no_lead_for_booking', created_at: new Date(nowMs - 5 * 86_400_000).toISOString() },
  ];

  return { properties, leads, inbound, calendarEvents };
}