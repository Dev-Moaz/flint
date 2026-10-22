// lib/report/digest-email.ts
// The daily e-mail for the agency, as HTML + plain text. Pure functions: testable and previewable.
//
// Privacy by design: e-mails get forwarded and stored in many inboxes, so this one carries
// first names and a last initial only. Phone numbers, e-mail addresses and every income
// figure stay behind the private dashboard link.
import { escapeHtml, oneLine } from '@/lib/email/screening-invitation';
import { BRAND_NAME } from '@/lib/brand';
import { fmtDateTime, fmtLongWhen, fmtAge, fmtPercent, fmtDay } from '@/lib/report/format';
import type { AttentionItem, ReportModel } from '@/lib/report/model';

const LIST_LIMIT = 6;

const INK = '#1c1c1e';
const MUTED = '#5d5b68';
const SMALL = '#77747f';
const VIOLET = '#8f80e6';
const PANEL = '#eae7fd';
const PAPER = '#faf9fd';
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export interface DigestContent {
  model: ReportModel;
  reportUrl: string;
  linkExpiresAt: string;
  /** Present on Mondays: the last seven days at a glance. */
  weekly?: { enquiries: number; outOfHours: number; booked: number } | null;
}

/** "Mateo Reid" -> "Mateo R." */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'Applicant';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Nothing happened and nothing is waiting: do not send a pointless email. */
export function shouldSendDigest(model: ReportModel): boolean {
  return model.metrics.enquiries > 0 || model.attention.length > 0 || model.highlights.booked.length > 0;
}

export function digestSubject(model: ReportModel): string {
  const { enquiries, booked } = model.metrics;
  const attention = model.attention.length;
  const base =
    enquiries === 0
      ? 'No new enquiries'
      : `${enquiries} ${enquiries === 1 ? 'enquiry' : 'enquiries'}, ${booked} ${booked === 1 ? 'viewing' : 'viewings'} booked`;
  return attention > 0 ? `${base} (${attention} need${attention === 1 ? 's' : ''} attention)` : base;
}

const KIND_TAG: Record<AttentionItem['kind'], string> = {
  NEEDS_REVIEW: 'Needs review',
  UNREADABLE_EMAIL: 'Unreadable email',
  INVITE_FAILED: 'Email failed',
  BOOKING_EXCEPTION: 'Booking issue',
  QUALIFIED_NOT_BOOKED: 'Call back',
  INVITE_NOT_COMPLETED: 'Not finished',
};

function attentionLine(item: AttentionItem): { title: string; detail: string } {
  if (!item.name) return { title: item.detail, detail: `${KIND_TAG[item.kind]}, ${fmtAge(item.ageHours)} ago` };
  const where = item.property ? ` \u00b7 ${item.property}` : '';
  return { title: `${shortName(item.name)}${where}`, detail: `${KIND_TAG[item.kind]}: ${item.detail}, ${fmtAge(item.ageHours)} ago` };
}

export function renderDailyDigest(content: DigestContent): { subject: string; html: string; text: string } {
  const { model, reportUrl, linkExpiresAt, weekly } = content;
  const e = escapeHtml;
  const agency = oneLine(model.agencyName, 80);
  const subject = digestSubject(model);
  const since = fmtDateTime(model.range.from);
  const expires = fmtDay(linkExpiresAt);

  const attention = model.attention.slice(0, LIST_LIMIT).map(attentionLine);
  const attentionMore = Math.max(0, model.attention.length - attention.length);
  const booked = model.highlights.booked.slice(0, LIST_LIMIT).map((b) => ({
    title: `${b.name} \u00b7 ${b.property}`,
    detail: b.detail ? fmtLongWhen(b.detail) : 'Viewing time to be confirmed',
  }));
  const bookedMore = Math.max(0, model.highlights.booked.length - booked.length);
  const notQualified = model.highlights.disqualified.slice(0, LIST_LIMIT).map((d) => ({
    title: `${d.name} \u00b7 ${d.property}`,
    detail: d.detail || 'Did not meet a criterion',
  }));
  const notQualifiedMore = Math.max(0, model.highlights.disqualified.length - notQualified.length);

  const m = model.metrics;
  const outOfHoursNote = m.outOfHoursShare === null ? '' : ` (${fmtPercent(m.outOfHoursShare)})`;

  // ------------------------------------------------------------------ text
  const section = (title: string, rows: Array<{ title: string; detail: string }>, more: number) =>
    rows.length === 0
      ? []
      : ['', title, ...rows.map((r) => `- ${r.title}\n  ${r.detail}`), ...(more > 0 ? [`+ ${more} more on the dashboard`] : [])];

  const text = [
    'Good morning,',
    '',
    `Here is what happened since ${since} (UK time):`,
    `- ${m.enquiries} enquiries, ${m.outOfHours} of them out of hours${outOfHoursNote}`,
    `- ${m.qualified} qualified, ${m.booked} viewings booked, ${m.disqualified} not qualified`,
    ...(weekly ? ['', `Last 7 days: ${weekly.enquiries} enquiries (${weekly.outOfHours} out of hours), ${weekly.booked} viewings booked.`] : []),
    ...section('Needs your attention', attention, attentionMore),
    ...section('Viewings booked', booked, bookedMore),
    ...section('Not qualified', notQualified, notQualifiedMore),
    '',
    `Open the full report (contact details and every enquiry): ${reportUrl}`,
    `This link is private and expires on ${expires}. Please do not forward it.`,
    '',
    `${BRAND_NAME}, for ${agency}.`,
  ].join('\n');

  // ------------------------------------------------------------------ html
  const stat = (value: number, label: string, hero = false) =>
    `<td width="25%" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${hero ? VIOLET : PANEL}" style="background:${hero ? VIOLET : PANEL};border-radius:16px;padding:14px 4px;"><div style="font-family:${SERIF};font-size:30px;line-height:1;font-weight:500;color:${hero ? '#ffffff' : INK};">${value}</div><div style="margin-top:6px;font-family:${SANS};font-size:11px;line-height:1.3;color:${hero ? 'rgba(255,255,255,0.9)' : MUTED};">${e(label)}</div></td></tr></table></td>`;

  const listBlock = (title: string, rows: Array<{ title: string; detail: string }>, more: number) => {
    if (rows.length === 0) return '';
    const items = rows
      .map(
        (r) =>
          `<tr><td style="padding:9px 0;border-top:1px solid #f0edf8;"><div style="font-family:${SANS};font-size:14px;line-height:1.4;font-weight:600;color:${INK};">${e(r.title)}</div><div style="margin-top:2px;font-family:${SANS};font-size:13px;line-height:1.45;color:${MUTED};">${e(r.detail)}</div></td></tr>`
      )
      .join('');
    return `<tr><td style="padding:22px 0 0 0;"><div style="font-family:${SERIF};font-size:20px;line-height:1.2;font-weight:500;letter-spacing:-0.01em;color:${INK};padding-bottom:8px;">${e(title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>${more > 0 ? `<div style="padding-top:6px;font-family:${SANS};font-size:12px;color:${SMALL};">+ ${more} more on the dashboard</div>` : ''}</td></tr>`;
  };

  const weeklyHtml = weekly
    ? `<tr><td style="padding:16px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">Last 7 days: <strong style="color:${INK};">${weekly.enquiries}</strong> enquiries (${weekly.outOfHours} out of hours), <strong style="color:${INK};">${weekly.booked}</strong> viewings booked.</td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(`${m.enquiries} enquiries since ${since}. ${m.outOfHours} came in out of hours.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};background-image:linear-gradient(135deg,#e6e1fb 0%,${PAPER} 48%,#f8eecb 100%);">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr><td style="padding:0 8px 18px 8px;font-family:${SERIF};font-size:20px;font-weight:500;letter-spacing:-0.01em;color:${INK};">${e(agency)}</td></tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #ece8f8;border-radius:24px;padding:32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="font-family:${SERIF};font-size:28px;line-height:1.15;font-weight:500;letter-spacing:-0.02em;color:${INK};padding-bottom:6px;">Good morning</td></tr>
              <tr><td style="font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED};padding-bottom:18px;">Here is what happened since ${e(since)} (UK time).</td></tr>
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                  ${stat(m.enquiries, 'Enquiries')}
                  ${stat(m.outOfHours, 'Out of hours', true)}
                  ${stat(m.qualified, 'Qualified')}
                  ${stat(m.booked, 'Booked')}
                </tr></table>
              </td></tr>
              ${weeklyHtml}
              ${listBlock('Needs your attention', attention, attentionMore)}
              ${listBlock('Viewings booked', booked, bookedMore)}
              ${listBlock('Not qualified', notQualified, notQualifiedMore)}
              <tr><td style="padding:28px 0 0 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td align="center" bgcolor="${INK}" style="background:${INK};border-radius:999px;"><a href="${e(reportUrl)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Open the full report</a></td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${SMALL};">The report has contact details and every enquiry. This link is private and expires on ${e(expires)}. Please do not forward it.</td></tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:16px 8px 0 8px;font-family:${SANS};font-size:12px;color:${SMALL};">${e(BRAND_NAME)}, for ${e(agency)}.</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}