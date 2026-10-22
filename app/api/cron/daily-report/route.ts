// app/api/cron/daily-report/route.ts
// Called once a day by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
//
// Manual use (same header):
//   ?dry=1            build everything, send nothing, write nothing (returns the subject + a text preview)
//   ?force=1          ignore "already done today"
//   ?agency=<slug>    only that agency
import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendTransactionalEmail } from '@/lib/email/resend';
import { runDailyReports } from '@/lib/report/run-daily';
import { BRAND_NAME } from '@/lib/brand';

export const runtime = 'nodejs';
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('NEXT_PUBLIC_APP_URL is not set');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const params = req.nextUrl.searchParams;
  try {
    const result = await runDailyReports({
      db: supabaseAdmin,
      now: new Date(),
      baseUrl,
      sendEmail: sendTransactionalEmail,
      sendWeekends: process.env.REPORT_SEND_WEEKENDS === 'true',
      fromName: process.env.REPORT_FROM_NAME || BRAND_NAME,
      adminEmail: process.env.ADMIN_EMAIL ?? null,
      replyTo: process.env.REPORT_REPLY_TO ?? null,
      force: params.get('force') === '1',
      dry: params.get('dry') === '1',
      onlySlug: params.get('agency'),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Daily report job failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Daily report job failed' }, { status: 500 });
  }
}