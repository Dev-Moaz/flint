// lib/calendar/transitions.ts
// The booking state machine as a pure function, so it can be tested without a database.
//
//   QUALIFIED --created--> BOOKED --cancelled--> QUALIFIED (can book again)
//   BOOKED --rescheduled--> BOOKED (new time, possibly new uid)
//   PENDING / DISQUALIFIED / NEEDS_REVIEW never become BOOKED (booking without screening is flagged)
import type { LeadStatus } from '@/types';

export interface LeadState {
  status: LeadStatus;
  cal_booking_uid: string | null;
}

export interface CalEvent {
  trigger: string;
  uid: string;
}

export type Decision =
  | { action: 'BOOK'; setBookedAt: boolean; reason?: string }
  | { action: 'CANCEL' }
  | { action: 'REJECT'; reason: string }
  | { action: 'NOOP'; reason: string };

export function decide(lead: LeadState, event: CalEvent): Decision {
  switch (event.trigger) {
    case 'BOOKING_CREATED':
    case 'BOOKING_RESCHEDULED': {
      if (lead.status === 'QUALIFIED') return { action: 'BOOK', setBookedAt: true };

      if (lead.status === 'BOOKED') {
        if (event.trigger === 'BOOKING_CREATED' && lead.cal_booking_uid === event.uid) {
          return { action: 'NOOP', reason: 'already_booked' };
        }
        return {
          action: 'BOOK',
          setBookedAt: false,
          reason: event.trigger === 'BOOKING_CREATED' ? 'replaced_booking' : undefined,
        };
      }

      return { action: 'REJECT', reason: 'lead_not_qualified' };
    }

    case 'BOOKING_CANCELLED': {
      // Only the CURRENT booking can cancel it: a late cancel of an old uid must not undo a newer booking
      if (lead.status === 'BOOKED' && lead.cal_booking_uid !== null && lead.cal_booking_uid === event.uid) {
        return { action: 'CANCEL' };
      }
      return { action: 'NOOP', reason: 'cancel_not_current_booking' };
    }

    default:
      return { action: 'NOOP', reason: 'unhandled_trigger' };
  }
}