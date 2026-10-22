// lib/calendar/build-url.ts
// One place that builds the tenant's booking link, so both paths (right after screening,
// and when the tenant reopens the link later) produce the same URL.
// It prefills name and email and attaches metadata[leadId], which Cal.com returns in its webhook.

export interface CalendarLead {
  id: string;
  name: string;
  email: string;
}

export function buildCalendarUrl(baseUrl: string | null | undefined, lead: CalendarLead): string | null {
  if (!baseUrl) return null;

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  url.searchParams.set('name', lead.name);
  url.searchParams.set('email', lead.email);
  url.searchParams.set('metadata[leadId]', lead.id);
  return url.toString();
}