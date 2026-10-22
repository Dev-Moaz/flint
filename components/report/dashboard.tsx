import type { ReactNode } from 'react';
import type { AttentionItem, ReportModel } from '@/lib/report/model';
import type { RangeKey } from '@/lib/report/config';
import { OFFICE_CLOSE_HOUR, OFFICE_OPEN_HOUR, RANGES } from '@/lib/report/config';
import { STATUS_LABELS } from '@/lib/report/labels';
import {
  fmtAge,
  fmtDateTime,
  fmtDay,
  fmtDelta,
  fmtDuration,
  fmtPercent,
  fmtTime,
  fmtWeekdayDay,
} from '@/lib/report/format';
import { buildStory } from '@/lib/report/story';
import { BRAND_NAME } from '@/lib/brand';
import LeadsTable, { type TableRow } from '@/components/report/leads-table';

interface DashboardProps {
  model: ReportModel;
  rangeKey: RangeKey;
  agencySlug: string;
  token: string;
  linkExpiresAt: string;
}

const ATTENTION_TAGS: Record<AttentionItem['kind'], { tag: string; tone: 'alert' | 'follow' }> = {
  NEEDS_REVIEW: { tag: 'Needs review', tone: 'alert' },
  UNREADABLE_EMAIL: { tag: 'Unreadable email', tone: 'alert' },
  INVITE_FAILED: { tag: 'Email failed', tone: 'alert' },
  BOOKING_EXCEPTION: { tag: 'Booking issue', tone: 'alert' },
  QUALIFIED_NOT_BOOKED: { tag: 'Call back', tone: 'follow' },
  INVITE_NOT_COMPLETED: { tag: 'Not finished', tone: 'follow' },
};

const ATTENTION_LIMIT = 12;

const Dot = () => <i className="rp-dot" aria-hidden="true" />;

/** A tiny trend line under a headline number. Hidden when there is nothing to draw. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(0, ...values);
  if (values.length < 3 || max === 0) return null;
  const w = 100;
  const h = 32;
  const pad = 3;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)} ${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`);
  const line = `M${points.join(' L')}`;
  return (
    <svg className="rp-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} className="rp-spark__area" />
      <path d={line} className="rp-spark__line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The two-line area chart inside the summary band: all enquiries, and the out-of-hours part. */
function Trend({ total, out }: { total: number[]; out: number[] }) {
  const max = Math.max(0, ...total);
  if (total.length < 3 || max === 0) return null;
  const w = 100;
  const h = 40;
  const pad = 3;
  const step = w / (total.length - 1);
  const path = (values: number[]) =>
    `M${values.map((v, i) => `${(i * step).toFixed(1)} ${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`).join(' L')}`;
  const all = path(total);
  const night = path(out);
  return (
    <svg className="rp-trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${all} L${w} ${h} L0 ${h} Z`} className="rp-trend__all" />
      <path d={all} className="rp-trend__allline" vectorEffect="non-scaling-stroke" />
      <path d={`${night} L${w} ${h} L0 ${h} Z`} className="rp-trend__out" />
      <path d={night} className="rp-trend__outline" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi(props: {
  label: string;
  value: string;
  note?: ReactNode;
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  spark?: number[];
  hero?: boolean;
}) {
  const arrow = props.delta?.direction === 'up' ? '\u25B2' : props.delta?.direction === 'down' ? '\u25BC' : '\u2014';
  return (
    <div className={`rp-kpi${props.hero ? ' rp-kpi--hero' : ''}`}>
      <div className="rp-kpi__label">{props.label}</div>
      <div className="rp-kpi__value">{props.value}</div>
      {props.note && <div className="rp-kpi__note">{props.note}</div>}
      {props.spark && <Sparkline values={props.spark} />}
      {props.delta && (
        <div className="rp-kpi__delta">
          <span aria-hidden="true">{arrow}</span> {props.delta.text}
        </div>
      )}
    </div>
  );
}

function ContactLinks({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email && !phone) return null;
  return (
    <span className="rp-contact">
      {phone && <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a>}
      {email && <a href={`mailto:${email}`}>{email}</a>}
    </span>
  );
}

export default function Dashboard({ model, rangeKey, agencySlug, token, linkExpiresAt }: DashboardProps) {
  const { metrics, previous } = model;
  const prevLabel = model.range.previousLabel;
  // Without any enquiries in the previous period there is nothing to compare with: show no arrow
  const hasPrevious = previous.enquiries > 0;
  const withPrev = (current: number, before: number) => {
    if (!hasPrevious) return undefined;
    const d = fmtDelta(current, before);
    return { ...d, text: d.direction === 'flat' ? `same as ${prevLabel}` : d.text.replace('before', prevLabel) };
  };

  const attention = model.attention;
  const shownAttention = attention.slice(0, ATTENTION_LIMIT);
  const maxDaily = Math.max(1, ...model.daily.map((d) => d.total));
  const labelEvery = model.daily.length > 14 ? 5 : 1;
  const funnelMax = Math.max(1, model.funnel[0]?.count ?? 1);
  const maxHour = Math.max(1, ...model.hourly.map((h) => h.total));
  const reasonMax = Math.max(1, ...model.reasons.map((r) => r.count));
  const maxProperty = Math.max(1, ...model.byProperty.map((p) => p.enquiries));
  const story = buildStory(model);
  const outcome = [
    { key: 'booked', label: 'Booked', count: metrics.booked },
    { key: 'qualified', label: 'Qualified, not booked', count: Math.max(0, metrics.qualified - metrics.booked) },
    { key: 'out', label: 'Not qualified', count: metrics.disqualified },
    { key: 'progress', label: 'In progress', count: metrics.inProgress },
    { key: 'review', label: 'Needs review', count: metrics.needsReview },
  ];
  const outcomeTotal = outcome.reduce((n, o) => n + o.count, 0);
  const bandLeft = (OFFICE_OPEN_HOUR / 24) * 100;
  const bandWidth = ((OFFICE_CLOSE_HOUR - OFFICE_OPEN_HOUR) / 24) * 100;

  const tableRows: TableRow[] = model.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    property: r.property,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status],
    details: r.details,
    received: fmtDateTime(r.receivedAt),
    invited: r.invitedAt ? fmtTime(r.invitedAt) : null,
    screened: r.screenedAt ? fmtDateTime(r.screenedAt) : null,
    viewing: r.viewingStartsAt ? fmtDateTime(r.viewingStartsAt) : null,
  }));

  return (
    <main className="rp">
      <div className="rp-grid" aria-hidden="true" />
      <div className="rp-wrap">
        <header className="rp-head">
          <div>
            <h1 className="rp-title">{model.agencyName}</h1>
            <p className="rp-sub">
              <span>Enquiry report</span>
              <Dot />
              <span>{model.range.label}</span>
              <Dot />
              <span>Updated {fmtTime(model.generatedAt)}, UK time</span>
            </p>
          </div>
          <nav className="rp-range" aria-label="Report period">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <a key={key} href={`/report/${agencySlug}?t=${token}&range=${key}`} aria-current={key === rangeKey ? 'page' : undefined}>
                {RANGES[key].label}
              </a>
            ))}
          </nav>
        </header>

        <div className="rp-layout">
          {/* ============================================ left rail: what to do */}
          <aside className="rp-rail" aria-label="What needs doing">
            <section className="rp-card rp-card--panel rp-attention" aria-labelledby="rp-att-title">
              <div className="rp-card__top">
                <h2 id="rp-att-title" className="rp-card__title">
                  Needs your attention
                </h2>
                {attention.length > 0 && <span className="rp-count">{attention.length}</span>}
              </div>
              {attention.length === 0 ? (
                <p className="rp-calm">Nothing needs your attention right now. Every enquiry has been handled or is waiting on the applicant.</p>
              ) : (
                <>
                  <p className="rp-card__hint">Enquiries that need a person: follow up, check or finish by hand.</p>
                  <ul className={`rp-att${shownAttention.length > 3 ? ' rp-att--scroll' : ''}`}>
                    {shownAttention.map((item, i) => {
                      const meta = ATTENTION_TAGS[item.kind];
                      return (
                        <li key={`${item.kind}-${item.leadId ?? i}`} className="rp-att__item">
                          <div className="rp-att__top">
                            <span className={`rp-tag rp-tag--${meta.tone}`}>{meta.tag}</span>
                            <span className="rp-att__age">{fmtAge(item.ageHours)} ago</span>
                          </div>
                          <div className="rp-att__main">
                            {item.name ? (
                              <>
                                <span className="rp-strong">{item.name}</span>
                                {item.property && <span className="rp-faint rp-faint--dark">{item.property}</span>}
                                <span className="rp-faint rp-faint--dark">{item.detail}</span>
                              </>
                            ) : (
                              <span className="rp-strong">{item.detail}</span>
                            )}
                            <ContactLinks email={item.email} phone={item.phone} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {attention.length > shownAttention.length && (
                    <p className="rp-more">+ {attention.length - shownAttention.length} more. Filter the table below to see every enquiry.</p>
                  )}
                </>
              )}
            </section>

            <section className="rp-card rp-upcoming" aria-labelledby="rp-up-title">
              <h2 id="rp-up-title" className="rp-card__title">Upcoming viewings</h2>
              <p className="rp-card__hint">Booked and still ahead, soonest first.</p>
              {model.upcoming.length === 0 ? (
                <p className="rp-empty">No viewings booked ahead.</p>
              ) : (
                <ul className="rp-list">
                  {model.upcoming.slice(0, 8).map((u) => (
                    <li key={u.leadId} className="rp-list__item">
                      <div className="rp-when">
                        <b>{fmtWeekdayDay(u.startsAt)}</b>
                        <span>{fmtTime(u.startsAt)}</span>
                      </div>
                      <div className="rp-list__main">
                        <span className="rp-strong">{u.name}</span>
                        <span className="rp-faint rp-faint--dark">{u.property}</span>
                        <ContactLinks email={u.email} phone={u.phone} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* ============================================ main: what happened */}
          <div className="rp-main">
            <section className="rp-story" aria-label="Summary">
              <div className="rp-story__text">
                <p className="rp-story__headline">{story.headline}</p>
                {story.detail && <p className="rp-story__detail">{story.detail}</p>}
              </div>
              <div className="rp-story__chart" aria-hidden="true">
                <Trend total={model.daily.map((d) => d.total)} out={model.daily.map((d) => d.outOfHours)} />
                <div className="rp-story__legend">
                  <span><i className="rp-story__swatch rp-story__swatch--out" />Out of hours</span>
                  <span><i className="rp-story__swatch rp-story__swatch--all" />All enquiries</span>
                </div>
              </div>
            </section>

            <section className="rp-kpis" aria-label="Headline numbers">
              <Kpi
                label="Enquiries"
                value={String(metrics.enquiries)}
                delta={withPrev(metrics.enquiries, previous.enquiries)}
                note="Lettings enquiries received"
                spark={model.daily.map((d) => d.total)}
              />
              <Kpi label="Time to invite" value={fmtDuration(metrics.medianReplySeconds)} note="Typical time from enquiry received to invitation sent" />
              <Kpi
                label="Completed the questions"
                value={fmtPercent(metrics.completionRate)}
                note={metrics.invited > 0 ? `${metrics.screened} of ${metrics.invited} invited applicants answered` : 'Nobody has been invited yet'}
              />
              <Kpi
                label="Qualified"
                value={String(metrics.qualified)}
                delta={withPrev(metrics.qualified, previous.qualified)}
                note={metrics.screened > 0 ? `Of ${metrics.screened} who answered the questions` : 'Nobody has answered yet'}
              />
              <Kpi
                label="Viewings booked"
                value={String(metrics.booked)}
                delta={withPrev(metrics.booked, previous.booked)}
                note={metrics.bookingRate === null ? 'No qualified applicants yet' : `${fmtPercent(metrics.bookingRate)} of qualified applicants`}
              />
              <Kpi
                label="Not qualified"
                value={String(metrics.disqualified)}
                delta={withPrev(metrics.disqualified, previous.disqualified)}
                note="Reasons are shown below"
              />
            </section>

            <div className="rp-row rp-row--charts">
              <section className="rp-card" aria-labelledby="rp-daily-title">
                <h2 id="rp-daily-title" className="rp-card__title">Enquiries by day</h2>
                <p className="rp-card__hint">
                  <span className="rp-key rp-key--out" /> Out of hours <span className="rp-key rp-key--in" /> Office hours
                </p>
                <div className="rp-bars" role="img" aria-label={`Enquiries per day, ${metrics.enquiries} in total, ${metrics.outOfHours} out of hours`}>
                  {model.daily.map((d) => {
                    const inHours = d.total - d.outOfHours;
                    return (
                      <div key={d.date} className="rp-bars__col rp-tip" data-tip={`${fmtWeekdayDay(`${d.date}T12:00:00Z`)}: ${d.total} ${d.total === 1 ? 'enquiry' : 'enquiries'}, ${d.outOfHours} out of hours`}>
                        {d.total === 0 ? (
                          <div className="rp-seg rp-seg--empty" />
                        ) : (
                          <>
                            {inHours > 0 && <div className="rp-seg rp-seg--in" style={{ height: `${(inHours / maxDaily) * 100}%` }} />}
                            {d.outOfHours > 0 && <div className="rp-seg rp-seg--out" style={{ height: `${(d.outOfHours / maxDaily) * 100}%` }} />}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="rp-axis" aria-hidden="true">
                  {model.daily.map((d, i) => (
                    <span key={d.date}>{i % labelEvery === 0 ? fmtDay(`${d.date}T12:00:00Z`) : ''}</span>
                  ))}
                </div>
              </section>

              <section className="rp-card" aria-labelledby="rp-hours-title">
                <h2 id="rp-hours-title" className="rp-card__title">When enquiries arrive</h2>
                <p className="rp-card__hint">By hour of the day, UK time. The shaded band is your office hours.</p>
                <div className="rp-hours-wrap">
                  <div className="rp-hours-band" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} aria-hidden="true" />
                  <div className="rp-hours" role="img" aria-label="Enquiries by hour of the day">
                    {model.hourly.map((h) => {
                      const inHours = h.total - h.outOfHours;
                      return (
                        <div key={h.hour} className="rp-hours__col rp-tip" data-tip={`${String(h.hour).padStart(2, '0')}:00: ${h.total} ${h.total === 1 ? 'enquiry' : 'enquiries'}`}>
                          {inHours > 0 && <div className="rp-seg rp-seg--in" style={{ height: `${(inHours / maxHour) * 100}%` }} />}
                          {h.outOfHours > 0 && <div className="rp-seg rp-seg--out" style={{ height: `${(h.outOfHours / maxHour) * 100}%` }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rp-hours-axis" aria-hidden="true">
                  {model.hourly.map((h) => (
                    <span key={h.hour}>{h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</span>
                  ))}
                </div>
              </section>
            </div>

            <div className="rp-row rp-row--insight">
              <section className="rp-card" aria-labelledby="rp-funnel-title">
                <h2 id="rp-funnel-title" className="rp-card__title">From enquiry to viewing</h2>
                <p className="rp-card__hint">Where applicants are in the process, {model.range.label.toLowerCase()}.</p>
                <ol className="rp-funnel">
                  {model.funnel.map((stage, i) => {
                    const prev = i === 0 ? null : model.funnel[i - 1].count;
                    const pct = Math.max(2, Math.round((stage.count / funnelMax) * 100));
                    return (
                      <li key={stage.key}>
                        <div className="rp-funnel__line">
                          <span>{stage.label}</span>
                          <span>
                            <b className="rp-strong">{stage.count}</b>
                            {prev !== null && prev > 0 && <span className="rp-faint"> {Math.round((stage.count / prev) * 100)}% of previous step</span>}
                          </span>
                        </div>
                        <div className="rp-bar" aria-hidden="true">
                          <div className={`rp-bar__fill rp-bar__fill--${i}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className="rp-card" aria-labelledby="rp-reasons-title">
                <h2 id="rp-reasons-title" className="rp-card__title">How enquiries ended up</h2>
                <p className="rp-card__hint">Every enquiry in {model.range.label.toLowerCase()}, by where it stands now.</p>
                {outcomeTotal === 0 ? (
                  <p className="rp-empty">No enquiries in this period.</p>
                ) : (
                  <>
                    <div className="rp-stack" role="img" aria-label={outcome.map((o) => `${o.count} ${o.label}`).join(', ')}>
                      {outcome
                        .filter((o) => o.count > 0)
                        .map((o) => (
                          <span key={o.key} className={`rp-stack__seg rp-stack__seg--${o.key}`} style={{ flexGrow: o.count }} />
                        ))}
                    </div>
                    <ul className="rp-legend">
                      {outcome.map((o) => (
                        <li key={o.key}>
                          <i className={`rp-swatch rp-stack__seg--${o.key}`} aria-hidden="true" />
                          {o.label}
                          <b>{o.count}</b>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <hr className="rp-divider" />
                <h3 className="rp-subtitle">Why applicants did not qualify</h3>
                {model.reasons.length === 0 ? (
                  <p className="rp-empty">Nobody was marked as not qualified in this period.</p>
                ) : (
                  <ul className="rp-funnel">
                    {model.reasons.map((r) => (
                      <li key={r.code}>
                        <div className="rp-funnel__line">
                          <span>{r.label}</span>
                          <b className="rp-strong">{r.count}</b>
                        </div>
                        <div className="rp-bar" aria-hidden="true">
                          <div className="rp-bar__fill rp-bar__fill--2" style={{ width: `${Math.max(4, Math.round((r.count / reasonMax) * 100))}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* ============================================ by property, full width */}
          <section className="rp-card rp-property rp-layout__full" aria-labelledby="rp-prop-title">
            <h2 id="rp-prop-title" className="rp-card__title">By property</h2>
            <p className="rp-card__hint">Which listings bring enquiries, and which turn into viewings.</p>
            {model.byProperty.length === 0 ? (
              <p className="rp-empty">No enquiries in this period.</p>
            ) : (
              <div className="rp-scroll">
                <table className="rp-table rp-table--compact">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th className="rp-barcell" aria-hidden="true" />
                      <th className="rp-num">Enquiries</th>
                      <th className="rp-num">Qualified</th>
                      <th className="rp-num">Booked</th>
                      <th className="rp-num">Not qualified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.byProperty.map((p) => (
                      <tr key={p.propertyId ?? 'none'}>
                        <td>{p.label}</td>
                        <td className="rp-barcell" aria-hidden="true">
                          <div className="rp-bar">
                            <div className="rp-bar__fill rp-bar__fill--3" style={{ width: `${Math.max(4, Math.round((p.enquiries / maxProperty) * 100))}%` }} />
                          </div>
                        </td>
                        <td className="rp-num">{p.enquiries}</td>
                        <td className="rp-num">{p.qualified}</td>
                        <td className="rp-num">{p.booked}</td>
                        <td className="rp-num">{p.disqualified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ============================================ every enquiry, full width */}
          <section className="rp-card rp-card--table rp-layout__full" aria-labelledby="rp-table-title">
            <h2 id="rp-table-title" className="rp-card__title">Every enquiry</h2>
            <p className="rp-card__hint">{model.range.label}. Click an email or phone number to get in touch.</p>
            <LeadsTable rows={tableRows} />
          </section>
        </div>

        <footer className="rp-foot">
          <p>
            Answers are declared by the applicant and are not verified. Right to Rent checks, referencing and affordability checks remain with your team. Income figures are never shown here. Times are UK time.
          </p>
          <p>This private link expires on {fmtDay(linkExpiresAt)}. Please do not forward it.</p>
          <p className="rp-foot__brand">
            Prepared by <span className="rp-wordmark">{BRAND_NAME}</span> for {model.agencyName}.
          </p>
        </footer>
      </div>
    </main>
  );
}