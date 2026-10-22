interface BookedConfirmationProps {
  startsAt?: string | null;
}

// Fixed zone so server and any later client render agree
const formatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

function formatStart(startsAt?: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  return Number.isNaN(date.getTime()) ? null : formatter.format(date);
}

export default function BookedConfirmation({ startsAt }: BookedConfirmationProps) {
  const when = formatStart(startsAt);

  return (
    <div className="sc-notice sc-notice--row sc-swap">
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
      <h3 className="sc-notice__title">Viewing Booked</h3>
      <p className="sc-notice__text">
        {when ? `Your viewing is booked for ${when} (UK time).` : 'Your viewing slot has been recorded.'} If you need to
        make a change, please contact the lettings team directly.
      </p>
    </div>
  );
}