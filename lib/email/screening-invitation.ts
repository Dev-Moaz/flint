// lib/email/screening-invitation.ts
// The screening invitation, rendered as HTML + plain text.
// Pure functions (no network, no SDK) so they can be tested and previewed offline.
//
// Email rules followed here: table layout, inline styles, no remote images or web fonts,
// a solid-colour fallback under every gradient, and a plain-text twin.
// Every dynamic value is escaped; the name/address come from outside, so never trust them.

export interface InvitationContent {
  tenantName: string;
  agencyName: string;
  propertyAddress: string;
  screeningUrl: string;
  /** Shown as "expires in N days" when provided. */
  expiresInDays?: number;
  /** The agency's real address, shown as the contact. When null the email tells the tenant to contact the agency directly. */
  contactEmail?: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Single line, no control characters, capped: for subjects and header values. */
export function oneLine(value: string, max = 120): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A display name that is safe inside a From header. */
export function safeDisplayName(name: string): string {
  return oneLine(name, 70).replace(/["<>\\]/g, '').trim() || 'Lettings team';
}

const INK = '#1c1c1e';
const MUTED = '#5d5b68';
const SMALL = '#77747f';
const VIOLET = '#8f80e6';
const PANEL = '#eae7fd';
const PAPER = '#faf9fd';
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export function renderScreeningInvitation(content: InvitationContent): { subject: string; html: string; text: string } {
  const agency = oneLine(content.agencyName, 80);
  const address = oneLine(content.propertyAddress, 140);
  const name = oneLine(content.tenantName, 60) || 'there';
  const url = content.screeningUrl;
  const contact = content.contactEmail ? oneLine(content.contactEmail, 120) : null;
  const days = content.expiresInDays && content.expiresInDays > 0 ? Math.round(content.expiresInDays) : null;

  const subject = `Your viewing enquiry: ${address}`;
  const preheader = `${agency} would like to arrange your viewing. It takes about a minute.`;

  const expiryText = days ? ` Your link is personal to you and expires in ${days} days.` : ' Your link is personal to you.';
  const contactText = contact
    ? `Questions? Reply to this email or contact ${agency} at ${contact}.`
    : `Questions? Please contact ${agency} directly.`;

  const asks = [
    'your household income',
    'your right to rent in England',
    'any county court judgments',
    'your preferred move-in date',
  ];

  // ------------------------------------------------------------------ text
  const text = [
    `Hi ${name},`,
    '',
    `Thanks for your enquiry about ${address}.`,
    '',
    `${agency} would like to arrange a viewing. To offer you the right slot, please answer four quick questions. It takes about a minute.`,
    '',
    `We will ask about ${asks.slice(0, -1).join(', ')} and ${asks[asks.length - 1]}.`,
    '',
    `Continue your enquiry: ${url}`,
    '',
    `This is an initial questionnaire for ${agency}. It is not a credit check, a reference or an offer of a tenancy.${expiryText} If you did not make this enquiry, you can ignore this email.`,
    '',
    contactText,
  ].join('\n');

  // ------------------------------------------------------------------ html
  const e = escapeHtml;
  const askItems = asks
    .map(
      (item) =>
        `<tr><td style="padding:3px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};"><span style="color:${VIOLET};font-weight:700;">&#10003;</span>&nbsp;&nbsp;${e(item)}</td></tr>`
    )
    .join('');

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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};background-image:linear-gradient(135deg,#e6e1fb 0%,${PAPER} 48%,#f8eecb 100%);">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 8px 18px 8px;font-family:${SERIF};font-size:20px;font-weight:500;letter-spacing:-0.01em;color:${INK};">${e(agency)}</td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #ece8f8;border-radius:24px;padding:34px 30px;">
            <h1 style="margin:0 0 18px 0;font-family:${SERIF};font-size:28px;line-height:1.15;font-weight:500;letter-spacing:-0.02em;color:${INK};">Thanks for your enquiry about ${e(address)}</h1>
            <p style="margin:0 0 14px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED};">Hi ${e(name)},</p>
            <p style="margin:0 0 20px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED};">${e(agency)} would like to arrange a viewing. To offer you the right slot, please answer four quick questions. It takes about a minute.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${PANEL};border-radius:18px;padding:16px 20px;">
                  <p style="margin:0 0 8px 0;font-family:${SANS};font-size:13px;font-weight:600;color:${MUTED};">We will ask about</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">${askItems}</table>
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 22px 0;">
              <tr>
                <td align="center" bgcolor="${INK}" style="background:${INK};border-radius:999px;">
                  <a href="${e(url)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Continue your enquiry</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${SMALL};">If the button does not work, copy this link into your browser:</p>
            <p style="margin:0 0 22px 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${SMALL};word-break:break-all;"><a href="${e(url)}" style="color:${SMALL};">${e(url)}</a></p>
            <p style="margin:0;padding-top:18px;border-top:1px solid #f0edf8;font-family:${SANS};font-size:12px;line-height:1.6;color:${SMALL};">This is an initial questionnaire for ${e(agency)}. It is not a credit check, a reference or an offer of a tenancy.${e(expiryText)} If you did not make this enquiry, you can ignore this email.</p>
            <p style="margin:10px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${SMALL};">${e(contactText)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 8px 0 8px;font-family:${SANS};font-size:12px;color:${SMALL};">Sent on behalf of ${e(agency)}.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}