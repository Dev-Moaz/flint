// lib/report/story.ts
// The one-sentence summary at the top of the dashboard. Pure, so its wording (singular and
// plural, empty periods, missing numbers) can be tested rather than trusted.
import { fmtDuration } from '@/lib/report/format';
import type { ReportModel } from '@/lib/report/model';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildStory(model: ReportModel): { headline: string; detail: string | null } {
  const { enquiries, outOfHours, medianReplySeconds, booked } = model.metrics;
  const attention = model.attention.length;

  let headline: string;
  if (enquiries === 0) {
    headline = 'No new enquiries in this period.';
  } else if (enquiries === 1) {
    headline = outOfHours === 1 ? 'The one enquiry arrived while your office was closed.' : 'The one enquiry arrived during office hours.';
  } else if (outOfHours === 0) {
    headline = `All ${enquiries} enquiries arrived during office hours.`;
  } else if (outOfHours === enquiries) {
    headline = `All ${enquiries} enquiries arrived while your office was closed.`;
  } else {
    headline = `${outOfHours} of ${enquiries} enquiries arrived while your office was closed.`;
  }

  const parts: string[] = [];
  if (medianReplySeconds !== null) parts.push(`Applicants were typically invited to answer within ${fmtDuration(medianReplySeconds)}.`);
  if (booked > 0) parts.push(`${plural(booked, 'viewing was', 'viewings were')} booked.`);
  if (attention > 0) parts.push(`${plural(attention, 'item needs', 'items need')} your attention.`);

  return { headline, detail: parts.length > 0 ? parts.join(' ') : null };
}