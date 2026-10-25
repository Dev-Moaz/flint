'use client';

import { useEffect, useState } from 'react';
import CalendarEmbed from '@/components/calendar-embed';

interface QualifiedConfirmationProps {
  calendarUrl: string | null | undefined;
  leadId: string;
  agencySlug: string;
}

// Wait this long before the first check, then check every second
const POLL_START_MS = 10_000;
const POLL_EVERY_MS = 1_000;

export default function QualifiedConfirmation({ calendarUrl, leadId, agencySlug }: QualifiedConfirmationProps) {
  const [booked, setBooked] = useState(false);

  // Watch the lead status; once the Cal.com webhook has set BOOKED, switch the panel and stop
  useEffect(() => {
    if (!calendarUrl || booked) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/lead-status?leadId=${encodeURIComponent(leadId)}&agencySlug=${encodeURIComponent(agencySlug)}`,
            { cache: 'no-store' }
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === 'BOOKED') setBooked(true);
        } catch {
          // ignore: the next tick tries again
        }
      }, POLL_EVERY_MS);
    }, POLL_START_MS);

    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [calendarUrl, booked, leadId, agencySlug]);

  if (!calendarUrl) {
    return (
      <div className="sc-soft sc-swap">
        Calendar currently unavailable. The lettings team will contact you directly.
      </div>
    );
  }

  return (
    <div className="sc-qualified sc-swap">
      <div className={`sc-confirmed${booked ? ' sc-confirmed--booked' : ''}`}>
        <span className={`sc-avatar ${booked ? 'sc-avatar--green' : 'sc-avatar--violet'}`}>
          <svg width="20" height="20" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 6.4 5 8.8l4.6-5.2"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div aria-live="polite">
          <h3 className="sc-confirmed__title">{booked ? 'All Set' : 'Pre-qualification Confirmed'}</h3>
          <p className="sc-confirmed__text">
            {booked ? 'Your viewing is booked. Check your email for details.' : 'Please choose your viewing slot below.'}
          </p>
        </div>
      </div>

      <CalendarEmbed calendarUrl={calendarUrl} />
    </div>
  );
}