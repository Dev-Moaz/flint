// Shown when the applicant has answered everything and the agency has to decide (lead status NEEDS_REVIEW).
// Same look as PoliteRejection; it never shows a calendar and never mentions income.
export default function UnderReview() {
  return (
    <div className="sc-notice sc-notice--row sc-swap">
      <span className="sc-avatar sc-avatar--lilac">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.2 12.4l2.7 2.7 5-5.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h3 className="sc-notice__title">Answers received</h3>
      <p className="sc-notice__text">
        The lettings team will review them and contact you directly about the next step.
      </p>
      <p className="sc-notice__small">There is nothing else you need to do.</p>
    </div>
  );
}