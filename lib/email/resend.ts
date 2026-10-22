// lib/email/resend.ts
import { Resend } from 'resend';
import { bareAddress } from '@/lib/inbound/senders';
import { renderScreeningInvitation, safeDisplayName } from '@/lib/email/screening-invitation';

export const resend = new Resend(process.env.RESEND_API_KEY);

// While testing this is Resend's shared sender (it only delivers to your own address).
// For real use, verify a domain in Resend and set EMAIL_FROM_ADDRESS, e.g. lettings@mail.yourdomain.com
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

interface SendScreeningInvitationParams {
  leadId: string;
  tenantName: string;
  tenantEmail: string;
  agencyName: string;
  propertyAddress: string;
  screeningUrl: string;
  expiresInDays?: number;
  /** The agency's real address: becomes Reply-To and the printed contact. */
  contactEmail?: string | null;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * Sends the screening link to the tenant.
 * The Resend SDK returns { data, error } instead of throwing, so this folds both
 * outcomes into one explicit result. The idempotency key (one per lead) stops a
 * retried webhook from sending a second email.
 */
export async function sendScreeningInvitation(params: SendScreeningInvitationParams): Promise<SendResult> {
  const replyTo = bareAddress(params.contactEmail);
  const { subject, html, text } = renderScreeningInvitation({
    tenantName: params.tenantName,
    agencyName: params.agencyName,
    propertyAddress: params.propertyAddress,
    screeningUrl: params.screeningUrl,
    expiresInDays: params.expiresInDays,
    contactEmail: replyTo,
  });

  try {
    const { data, error } = await resend.emails.send(
      {
        from: `"${safeDisplayName(params.agencyName)}" <${FROM_ADDRESS}>`,
        to: [params.tenantEmail],
        subject,
        html,
        text,
        ...(replyTo ? { replyTo } : {}),
      },
      { idempotencyKey: `screening-invitation/${params.leadId}` }
    );

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

interface TransactionalEmail {
  idempotencyKey: string;
  fromName: string;
  to: string;
  subject: string;
  html?: string;
  text: string;
  replyTo?: string | null;
}

/** Generic sender used by the daily report and the owner's summary. */
export async function sendTransactionalEmail(email: TransactionalEmail): Promise<SendResult> {
  const replyTo = bareAddress(email.replyTo);
  try {
    const { data, error } = await resend.emails.send(
      {
        from: `"${safeDisplayName(email.fromName)}" <${FROM_ADDRESS}>`,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
        ...(replyTo ? { replyTo } : {}),
      },
      { idempotencyKey: email.idempotencyKey }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}