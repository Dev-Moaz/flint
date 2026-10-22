import CalendarEmbed from '@/components/calendar-embed';

interface QualifiedConfirmationProps {
  calendarUrl: string | null | undefined;
}

export default function QualifiedConfirmation({ calendarUrl }: QualifiedConfirmationProps) {
  if (!calendarUrl) {
    return (
      <div className="sc-soft sc-swap">
        Calendar currently unavailable. The lettings team will contact you directly.
      </div>
    );
  }

  return (
    <div className="sc-qualified sc-swap">
      <div className="sc-confirmed">
        <span className="sc-avatar sc-avatar--violet">
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
        <div>
          <h3 className="sc-confirmed__title">Pre-qualification Confirmed</h3>
          <p className="sc-confirmed__text">Please choose your viewing slot below.</p>
        </div>
      </div>

      <CalendarEmbed calendarUrl={calendarUrl} />
    </div>
  );
}