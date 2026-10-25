// components/screening-form.tsx
'use client';

import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { TriageInput } from '@/types';
import QualifiedConfirmation from '@/components/qualified-confirmation';
import PoliteRejection from '@/components/polite-rejection';
import UnderReview from '@/components/under-review';
import { addDays, formatUkDate, londonDate, maskUkDate, parseUkDate } from '@/lib/dates';
import { MOVE_IN_MAX_DAYS } from '@/lib/triage-config';

interface ScreeningFormProps {
  leadId: string;
  agencySlug: string;
  monthlyRent: number;
}

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M2.5 6.4 5 8.8l4.6-5.2"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 8h9.5M8.5 4l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2.25" y="3.5" width="13.5" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.25 7.6h13.5M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const Alert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.5v5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="12" cy="16.2" r="1.1" fill="currentColor" />
  </svg>
);

type YesNo = 'yes' | 'no' | null;

// One yes / no question. Neither choice is preselected. The two rows reuse the look of the
// confirmation rows, with a round box instead of a square one.
function YesNoQuestion({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: YesNo;
  onChange: (answer: 'yes' | 'no') => void;
}) {
  const name = useId();
  return (
    <fieldset className="sc-ask">
      <legend className="sc-label">{legend}</legend>
      <div className="sc-ask__opts">
        {(['yes', 'no'] as const).map((answer) => (
          <label key={answer} className="sc-confirm">
            <input
              type="radio"
              name={name}
              value={answer}
              checked={value === answer}
              onChange={() => onChange(answer)}
              required
              className="sc-confirm__input"
            />
            <span className="sc-confirm__box" aria-hidden="true">
              <Tick />
            </span>
            <span className="sc-confirm__text">{answer === 'yes' ? 'Yes' : 'No'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function ScreeningForm({
  leadId,
  agencySlug,
  monthlyRent,
}: ScreeningFormProps) {
  const [formData, setFormData] = useState<Pick<TriageInput, 'annualIncome'>>({ annualIncome: 0 });

  // The move-in date is typed as dd/mm/yy; the server only ever receives the validated YYYY-MM-DD
  const [moveInText, setMoveInText] = useState('');
  const [moveInTouched, setMoveInTouched] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // No default on purpose: an unanswered question must never count as a "yes", and it must not
  // count as a "no" either, because a "no" rejects the applicant automatically.
  const [rightToRent, setRightToRent] = useState<YesNo>(null);
  const [hasCcj, setHasCcj] = useState<YesNo>(null);
  const [ukGuarantor, setUkGuarantor] = useState<YesNo>(null);

  const [isPending, startTransition] = useTransition();
  const [submissionResult, setSubmissionResult] = useState<{
    status: 'idle' | 'success' | 'review' | 'rejected' | 'error';
    calendarUrl?: string | null;
    errorMessage?: string;
  }>({ status: 'idle' });

  const incomeId = useId();
  const incomeHintId = useId();
  const dateId = useId();
  const dateErrorId = useId();

  // From today (London) up to a sanity limit; the date is recorded, not a screening rule
  const { minDate, maxDate } = useMemo(() => {
    const today = londonDate();
    return { minDate: today, maxDate: addDays(today, MOVE_IN_MAX_DAYS) };
  }, []);

  // null until the text is a real date inside that window
  const parsedMoveIn = parseUkDate(moveInText);
  const moveInDate = parsedMoveIn !== null && parsedMoveIn >= minDate && parsedMoveIn <= maxDate ? parsedMoveIn : null;
  // Only complain once the person has left the field, or has typed a full four-digit year
  const showDateError = moveInText !== '' && moveInDate === null && (moveInTouched || moveInText.length === 10);

  const canSubmit = rightToRent !== null && hasCcj !== null && ukGuarantor !== null && moveInDate !== null;

  // The calendar button opens the browser's own date picker (a hidden date input) and copies the choice into the text field
  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      if (typeof picker.showPicker === 'function') picker.showPicker();
      else picker.click();
    } catch {
      // some browsers refuse to open it from here: typing the date still works
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // The button stays disabled until the date is valid and every question is answered; this also covers any other way of submitting
    if (rightToRent === null || hasCcj === null || ukGuarantor === null || moveInDate === null) return;

    // The server receives booleans: "no CCJs" is the answer "No" to the CCJ question
    const answers: TriageInput = {
      ...formData,
      moveInDate,
      hasRightToRent: rightToRent === 'yes',
      hasNoCCJ: hasCcj === 'no',
      canProvideUkGuarantor: ukGuarantor === 'yes',
    };

    startTransition(async () => {
      try {
        const response = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId,
            agencySlug,
            formData: answers,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setSubmissionResult({
            status: 'error',
            errorMessage: data.error || 'Failed to submit application',
          });
          return;
        }

        if (data.outcome === 'qualified') {
          setSubmissionResult({
            status: 'success',
            calendarUrl: data.calendarUrl,
          });
        } else if (data.outcome === 'review') {
          setSubmissionResult({
            status: 'review',
          });
        } else {
          setSubmissionResult({
            status: 'rejected',
          });
        }
      } catch (err) {
        setSubmissionResult({
          status: 'error',
          errorMessage: 'Connection error. Please try again.',
        });
      }
    });
  };

  // شاشة النجاح: إظهار التقويم بنعومة
  if (submissionResult.status === 'success') return <QualifiedConfirmation calendarUrl={submissionResult.calendarUrl} />;

  // أجاب عن الأسئلة ودخله ينتظر قرار الوكالة
  if (submissionResult.status === 'review') return <UnderReview />;

  // شاشة الرفض الهادئة
  if (submissionResult.status === 'rejected') return <PoliteRejection />;

  return (
    <form onSubmit={handleSubmit} className="sc-form">
      {submissionResult.status === 'error' && (
        <div className="sc-error" role="alert">
          <Alert />
          <span>{submissionResult.errorMessage}</span>
        </div>
      )}

      <div className="sc-cols">
        {/* حقل 1: الدخل السنوي الإجمالي */}
        <div className="sc-field sc-field--income">
          <label htmlFor={incomeId} className="sc-label">
            Household Gross Annual Income
          </label>
          <p id={incomeHintId} className="sc-hint">
            Before tax. Include salary, benefits, pensions and any other regular income of the household.
          </p>
          <div className="sc-income">
            <span className="sc-income__sign" aria-hidden="true">
              £
            </span>
            <input
              id={incomeId}
              type="number"
              inputMode="numeric"
              required
              min="0"
              aria-describedby={incomeHintId}
              placeholder="Enter annual income"
              value={formData.annualIncome || ''}
              onChange={(e) => setFormData({ ...formData, annualIncome: Number(e.target.value) })}
              onWheel={(e) => e.currentTarget.blur()}
              className="sc-income__input"
            />
          </div>
        </div>

        {/* حقل 2: تاريخ الانتقال */}
        <div className="sc-field sc-field--date">
          <label htmlFor={dateId} className="sc-label">
            Target Move-in Date
          </label>
          <div className="sc-date">
            <input
              id={dateId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={10}
              placeholder="dd/mm/yy"
              value={moveInText}
              onChange={(e) => setMoveInText(maskUkDate(e.target.value))}
              onBlur={() => setMoveInTouched(true)}
              aria-invalid={showDateError}
              aria-describedby={showDateError ? dateErrorId : undefined}
              className="sc-input"
            />
            <button type="button" onClick={openPicker} aria-label="Choose the date from a calendar" className="sc-date__pick">
              <CalendarIcon />
            </button>
            <input
              ref={pickerRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              min={minDate}
              max={maxDate}
              value={moveInDate ?? ''}
              onChange={(e) => setMoveInText(formatUkDate(e.target.value))}
              className="sc-date__native"
            />
          </div>
          {showDateError && (
            <p id={dateErrorId} className="sc-field__error" role="alert">
              Please enter a date as dd/mm/yy, from today up to {formatUkDate(maxDate)}.
            </p>
          )}
        </div>

        {/* تأكيد الإقامة والسجل الائتماني */}
        <div className="sc-confirms">
          <YesNoQuestion legend="Do you have the right to rent in England?" value={rightToRent} onChange={setRightToRent} />
          <YesNoQuestion legend="Do you have any active County Court Judgments (CCJs)?" value={hasCcj} onChange={setHasCcj} />
          <YesNoQuestion legend="If needed, could you provide a guarantor who lives in the UK?" value={ukGuarantor} onChange={setUkGuarantor} />
        </div>

        <button type="submit" disabled={isPending || !canSubmit} aria-busy={isPending} className="sc-submit">
          <span>{isPending ? 'Verifying eligibility...' : 'Verify & Reserve Viewing Slot'}</span>
          {!isPending && <Arrow />}
        </button>
      </div>
    </form>
  );
}