export default function PoliteRejection() {
  return (
    <div className="sc-notice sc-notice--row sc-swap">
      <span className="sc-avatar sc-avatar--lilac">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
        </svg>
      </span>
      <h3 className="sc-notice__title">Application Notice</h3>
      <p className="sc-notice__text">
        Based on the criteria agreed with the landlord for this tenancy, we cannot confirm an automated viewing slot at this time.
      </p>
      <p className="sc-notice__small">
        Your enquiry details have been forwarded to the lettings team for manual review.
      </p>
    </div>
  );
}