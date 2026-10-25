// app/screen/[agencySlug]/[leadId]/page.tsx
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { getLeadScreeningData } from '@/lib/triage-service';
import ScreeningForm from '@/components/screening-form';
import QualifiedConfirmation from '@/components/qualified-confirmation';
import PoliteRejection from '@/components/polite-rejection';
import BookedConfirmation from '@/components/booked-confirmation';
import { serif, sans } from '@/lib/fonts';
import '../../screening.css';

// Personal links: keep them out of search results and out of Referer headers
export const metadata: Metadata = {
  title: { absolute: 'Your viewing enquiry' }, // bypasses the site title template: applicants deal with the agency
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{
    agencySlug: string;
    leadId: string;
  }>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className={`sc ${serif.variable} ${sans.variable}`}>
      <div className="sc-grid" aria-hidden="true" />
      <div className="sc-wrap">{children}</div>
    </main>
  );
}

const InfoIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
  </svg>
);

export default async function ScreeningPage({ params }: PageProps) {
  const { agencySlug, leadId } = await params;
  const screeningData = await getLeadScreeningData(agencySlug, leadId);

  // حالة الرابط غير الصالح
  if (!screeningData.isValid) {
    return (
      <Shell>
        <div className="sc-card">
          <div className="sc-notice">
            <span className="sc-avatar sc-avatar--lilac">
              <InfoIcon />
            </span>
            <h1 className="sc-notice__title">Link Unavailable</h1>
            <p className="sc-notice__text">
              {screeningData.errorMessage || 'This invitation link has expired.'}
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const monthlyRent = screeningData.monthlyRent || 0;

  // نكمل من اللحظة التي توقف عندها المستأجر
  let body: ReactNode;
  switch (screeningData.status) {
    case 'PENDING':
      body = (
        <ScreeningForm
          leadId={leadId}
          agencySlug={agencySlug}
          monthlyRent={monthlyRent}
        />
      );
      break;

    // تأهل لكنه لم يحجز بعد: نعيد له التقويم
    case 'QUALIFIED':
      body = <QualifiedConfirmation calendarUrl={screeningData.calendarUrl} />;
      break;

    case 'DISQUALIFIED':
      body = <PoliteRejection />;
      break;

    case 'BOOKED':
      body = <BookedConfirmation startsAt={screeningData.viewingStartsAt} />;
      break;

    // حالة غير متوقعة في قاعدة البيانات
    default:
      body = (
        <div className="sc-notice">
          <span className="sc-avatar sc-avatar--lilac">
            <InfoIcon />
          </span>
          <h1 className="sc-notice__title">Already Completed</h1>
          <p className="sc-notice__text">
            Your enquiry is currently under review by the team.
          </p>
        </div>
      );
  }

  return (
    <Shell>
      <header className="sc-head">
        <h1 className="sc-title">{screeningData.propertyAddress}</h1>
        <p className="sc-sub">
          <span>{screeningData.agencyName}</span>
          <i className="sc-dot" aria-hidden="true" />
          <span>£{monthlyRent.toLocaleString('en-GB')} pcm</span>
        </p>
      </header>

      {/* البطاقة البيضاء الحاضنة للمحتوى حسب الحالة */}
      <div className="sc-card">{body}</div>
    </Shell>
  );
}