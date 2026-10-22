// app/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Inter, Newsreader } from "next/font/google";
import { BRAND_NAME } from "@/lib/brand";

/* ------------------------------------------------------------------ */
/*  Placeholders: change these two values and nothing else.           */
/* ------------------------------------------------------------------ */
const BRAND = BRAND_NAME;
const CONTACT_EMAIL = "hello@example.com";

const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--lk-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--lk-sans",
  display: "swap",
});

/* ------------------------------------------------------------------ */
/*  Icons                                                             */
/* ------------------------------------------------------------------ */
const Tick = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 6.4 5 8.8l4.6-5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const HouseIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.2v-5.6H9.2V20H5a1 1 0 0 1-1-1z"
      fill="#fff"
    />
  </svg>
);

const MoonIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z"
      stroke="#4a3500"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  The three scenes: one enquiry, from first message to booked viewing */
/* ------------------------------------------------------------------ */
type Scene = {
  id: string;
  hint: string;
  avatar: ReactNode;
  title: string;
  meta: [string, string];
  checks?: string[];
};

const scenes: Scene[] = [
  {
    id: "enquiry",
    hint: "Enquiry received",
    avatar: <span className="lk-avatar lk-avatar--sand">JM</span>,
    title: "Is the two-bed on Alder Road still available from 1 March?",
    meta: ["Rightmove, 23:42", "Replied in 8 seconds"],
  },
  {
    id: "screening",
    hint: "Screening result",
    avatar: (
      <span className="lk-avatar lk-avatar--violet">
        <Tick size={18} />
      </span>
    ),
    title: "All lettings criteria met.",
    meta: ["Screened automatically", "Viewing offered"],
    checks: [
      "Income at least 30× monthly rent",
      "Right to Rent declared",
      "No CCJs declared",
      "Move-in date noted",
    ],
  },
  {
    id: "viewing",
    hint: "Viewing booked",
    avatar: (
      <span className="lk-avatar lk-avatar--lilac">
        <CalendarIcon />
      </span>
    ),
    title: "Viewing booked for Saturday at 11:30, Alder Road.",
    meta: ["Added to agency diary", "Confirmation sent"],
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function Page() {
  const [active, setActive] = useState(1);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => stop, [stop]);

  const select = (i: number) => {
    stop();
    setPlaying(false);
    setActive(i);
  };

  const play = () => {
    stop();
    setPlaying(true);
    setActive(0);
    const step = 2000;
    timers.current = [
      window.setTimeout(() => setActive(1), step),
      window.setTimeout(() => setActive(2), step * 2),
      window.setTimeout(() => setPlaying(false), step * 2 + 800),
    ];
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(i);
    }
  };

  return (
    <main className={`lk ${serif.variable} ${sans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="lk-grid" aria-hidden="true" />

      <section className="lk-hero">
        <div className="lk-brand">
          <svg className="lk-brand__mark" width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="16" fill="#8f80e6" />
            <path d="M32 10 Q34 30 54 32 Q34 34 32 54 Q30 34 10 32 Q30 30 32 10 Z" fill="#f6c744" />
          </svg>
          <span>{BRAND}</span>
        </div>

        <div className="lk-headwrap">
          <h1 className="lk-title">
            Every tenant enquiry
            <br className="lk-br" /> answered before breakfast.
          </h1>
          <span className="lk-orb lk-orb--violet" aria-hidden="true">
            <span className="lk-orb__core">
              <HouseIcon />
            </span>
          </span>
        </div>

        <div className="lk-copy">
          <p className="lk-lede">
            Out-of-hours enquiries answered in seconds and screened against UK
            lettings criteria. Only qualified applicants reach your diary.
          </p>
          <span className="lk-orb lk-orb--sun" aria-hidden="true">
            <span className="lk-orb__core">
              <MoonIcon />
            </span>
          </span>
        </div>

        <div className="lk-actions">
          <a className="lk-btn lk-btn--dark" href={`mailto:${CONTACT_EMAIL}?subject=Introduction`}>
            Request an introduction
          </a>
          <button type="button" className="lk-btn lk-btn--soft" onClick={play} disabled={playing}>
            Follow one enquiry
          </button>
        </div>

        <p className="lk-note">
          Currently working with a select number of independent agencies across London, Zones 2 to 5.
        </p>
      </section>

      <div
        className="lk-stage"
        role="group"
        aria-label="One tenant enquiry, from first message to booked viewing"
      >
        <svg className="lk-arch" viewBox="0 0 120 110" aria-hidden="true">
          <defs>
            <linearGradient id="lk-arch-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c2b6f5" />
              <stop offset="1" stopColor="#a698ea" />
            </linearGradient>
          </defs>
          <path d="M0 110V60C0 27 27 0 60 0s60 27 60 60v50z" fill="url(#lk-arch-g)" />
          <circle cx="60" cy="40" r="8.5" fill="#2b2345" />
          <path d="M55.6 46h8.8l3.4 20H52.2z" fill="#2b2345" />
        </svg>

        {scenes.map((scene, i) => {
          const rel = (i - active + scenes.length) % scenes.length;
          const slot = rel === 0 ? "center" : rel === 1 ? "right" : "left";
          const isCenter = slot === "center";

          return (
            <div
              key={scene.id}
              className="lk-slot"
              data-slot={slot}
              role={isCenter ? undefined : "button"}
              tabIndex={isCenter ? -1 : 0}
              aria-label={isCenter ? undefined : `Show: ${scene.hint}`}
              onClick={isCenter ? undefined : () => select(i)}
              onKeyDown={isCenter ? undefined : (e) => onKey(e, i)}
            >
              <article className="lk-card" style={{ ["--i" as string]: i }}>
                {scene.avatar}
                <h2 className="lk-card__title">{scene.title}</h2>
                <p className="lk-meta">
                  <span>{scene.meta[0]}</span>
                  <i className="lk-dot" aria-hidden="true" />
                  <span>{scene.meta[1]}</span>
                </p>
                {scene.checks && (
                  <ul className="lk-checks">
                    {scene.checks.map((c) => (
                      <li key={c}>
                        <span className="lk-check" aria-hidden="true">
                          <Tick />
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          );
        })}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles (scoped by the .lk prefix, no Tailwind dependency)         */
/* ------------------------------------------------------------------ */
const css = `
:where(body){margin:0}
.lk, .lk *, .lk *::before, .lk *::after{box-sizing:border-box}

.lk{
  --ink:#1c1c1e;
  --violet:#8f80e6;
  --muted:#5d5b68;
  position:relative;
  isolation:isolate;
  display:flex;
  flex-direction:column;
  min-height:100svh;
  overflow:hidden;
  color:var(--ink);
  font-family:var(--lk-sans), system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(70% 62% at 0% 100%, #c5b9f6 0%, rgba(197,185,246,0) 72%),
    radial-gradient(62% 72% at 100% 52%, #f8eecb 0%, rgba(248,238,203,0) 72%),
    radial-gradient(48% 42% at 0% 8%, rgba(216,208,250,.6) 0%, rgba(216,208,250,0) 72%),
    #faf9fd;
}

/* faint grid, fades out toward the edges */
.lk-grid{
  position:absolute;
  inset:0;
  z-index:-1;
  pointer-events:none;
  background-image:
    linear-gradient(to right, rgba(255,255,255,.85) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,.85) 1px, transparent 1px);
  background-size:72px 72px;
  background-position:center top;
  -webkit-mask-image:radial-gradient(90% 80% at 50% 45%, #000 20%, transparent 85%);
  mask-image:radial-gradient(90% 80% at 50% 45%, #000 20%, transparent 85%);
}

/* ---------- hero ---------- */
.lk-hero{
  position:relative;
  z-index:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  text-align:center;
  padding:clamp(36px, 8svh, 88px) 24px clamp(28px, 5svh, 56px);
}
.lk-brand{
  display:inline-flex;
  align-items:center;
  gap:10px;
  font-family:var(--lk-serif), Georgia, serif;
  font-size:1.375rem;
  font-weight:500;
  letter-spacing:-.01em;
}
.lk-headwrap{position:relative;margin-top:clamp(36px, 9svh, 96px)}
.lk-title{
  margin:0;
  font-family:var(--lk-serif), Georgia, serif;
  font-weight:500;
  font-size:clamp(2.4rem, 1.2rem + 4.6vw, 4.4rem);
  line-height:1.04;
  letter-spacing:-.022em;
  text-wrap:balance;
}
.lk-br{display:none}
.lk-copy{position:relative;margin-top:clamp(18px, 3svh, 28px);max-width:35rem}
.lk-lede{
  margin:0;
  font-size:1.0625rem;
  line-height:1.55;
  color:var(--muted);
  text-wrap:balance;
}
.lk-actions{
  margin-top:clamp(22px, 4svh, 36px);
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  gap:10px;
}
.lk-note{margin:20px 0 0;font-size:.8125rem;line-height:1.5;color:#77747f;max-width:30rem;text-wrap:balance}

/* ---------- buttons ---------- */
.lk-btn{
  display:inline-flex;
  align-items:center;
  height:42px;
  padding:0 20px;
  border:0;
  border-radius:999px;
  font:500 .875rem/1 var(--lk-sans), system-ui, sans-serif;
  text-decoration:none;
  cursor:pointer;
  transition:background-color .2s ease, box-shadow .2s ease, opacity .2s ease;
}
.lk-btn--dark{
  background:var(--ink);
  color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.16), 0 8px 18px -8px rgba(28,28,30,.55);
}
.lk-btn--dark:hover{background:#38383c}
.lk-btn--soft{
  background:rgba(255,255,255,.72);
  color:var(--ink);
  box-shadow:0 0 0 1px rgba(28,28,30,.06);
}
.lk-btn--soft:hover:not(:disabled){background:rgba(255,255,255,.95)}
.lk-btn:disabled{opacity:.55;cursor:default}
.lk-btn:focus-visible,
.lk-slot:focus-visible{outline:2px solid var(--violet);outline-offset:3px}

/* ---------- floating orbs ---------- */
.lk-orb{
  position:absolute;
  display:grid;
  place-items:center;
  width:64px;
  height:64px;
  border-radius:50%;
  background:#fff;
  box-shadow:0 12px 30px -10px rgba(60,40,140,.3);
}
.lk-orb__core{display:grid;place-items:center;width:36px;height:36px;border-radius:50%}
.lk-orb--violet{right:-100px;top:-34px}
.lk-orb--violet .lk-orb__core{background:var(--violet)}
.lk-orb--sun{left:-44px;bottom:-60px}
.lk-orb--sun .lk-orb__core{background:#f6c744}

/* ---------- card stage ---------- */
.lk-stage{
  --cw:clamp(250px, 31vw, 330px);
  --dx:calc(var(--cw) * .9);
  position:relative;
  z-index:1;
  margin-top:auto;
  height:clamp(250px, 36svh, 340px);
  overflow:hidden;
}
.lk-arch{
  position:absolute;
  z-index:1;
  top:0;
  left:calc(50% - var(--dx) - var(--cw) / 2 + 12px);
  width:112px;
  height:auto;
}
.lk-slot{
  position:absolute;
  top:14px;
  left:50%;
  width:var(--cw);
  border-radius:26px;
  transition:transform .75s cubic-bezier(.2,.8,.2,1);
}
.lk-slot[data-slot="center"]{z-index:3;transform:translate(-50%, 0) rotate(0deg) scale(1)}
.lk-slot[data-slot="left"]{z-index:2;cursor:pointer;transform:translate(calc(-50% - var(--dx)), 40px) rotate(-6deg) scale(.97)}
.lk-slot[data-slot="right"]{z-index:2;cursor:pointer;transform:translate(calc(-50% + var(--dx)), 40px) rotate(6deg) scale(.97)}

.lk-card{
  display:flex;
  flex-direction:column;
  align-items:center;
  min-height:420px;
  padding:24px 22px 28px;
  text-align:center;
  background:#fff;
  border:3px solid rgba(255,255,255,.92);
  border-radius:26px;
  box-shadow:0 24px 44px -16px rgba(70,50,150,.22), 0 2px 6px rgba(70,50,150,.06);
  transition:background-color .5s ease, transform .35s ease;
  animation:lk-rise .95s cubic-bezier(.2,.7,.2,1) backwards;
  animation-delay:calc(var(--i, 0) * 110ms + 150ms);
}
.lk-slot[data-slot="center"] .lk-card{background:#eae7fd}
.lk-slot:not([data-slot="center"]):hover .lk-card{transform:translateY(-6px)}

@keyframes lk-rise{
  from{opacity:0;transform:translateY(80px)}
  to{opacity:1;transform:translateY(0)}
}

.lk-avatar{
  display:grid;
  place-items:center;
  width:44px;
  height:44px;
  border-radius:50%;
  font:600 .8125rem/1 var(--lk-sans), system-ui, sans-serif;
  box-shadow:0 0 0 4px rgba(255,255,255,.9), 0 8px 16px -8px rgba(60,40,140,.35);
}
.lk-avatar--sand{background:#f3e3ad;color:#6a5416}
.lk-avatar--violet{background:var(--violet);color:#fff}
.lk-avatar--lilac{background:#ddd7fb;color:#5645c6}

.lk-card__title{
  margin:18px 0 0;
  max-width:15.5em;
  font-family:var(--lk-serif), Georgia, serif;
  font-weight:500;
  font-size:1.3125rem;
  line-height:1.24;
  letter-spacing:-.012em;
  text-wrap:balance;
}
.lk-meta{
  display:flex;
  align-items:center;
  justify-content:center;
  flex-wrap:wrap;
  gap:4px 8px;
  margin:14px 0 0;
  font-size:.75rem;
  color:#6c6978;
}
.lk-dot{width:5px;height:5px;border-radius:50%;background:var(--violet)}

.lk-checks{
  display:flex;
  flex-direction:column;
  gap:9px;
  margin:20px 0 0;
  padding:0;
  list-style:none;
  text-align:left;
  font-size:.8125rem;
  color:#3d3b48;
}
.lk-checks li{display:flex;align-items:center;gap:10px}
.lk-check{
  flex:none;
  display:grid;
  place-items:center;
  width:18px;
  height:18px;
  border-radius:50%;
  background:var(--violet);
  color:#fff;
}

/* ---------- smaller screens ---------- */
@media (min-width:720px){
  .lk-br{display:inline}
}
@media (max-width:719px){
  .lk-orb--violet{width:48px;height:48px;right:-4px;top:-56px}
  .lk-orb--violet .lk-orb__core{width:28px;height:28px}
  .lk-orb--sun,
  .lk-arch{display:none}
  .lk-card__title{font-size:1.1875rem}
}

@media (prefers-reduced-motion:reduce){
  .lk-card{animation:none}
  .lk-slot,
  .lk-card{transition:none}
}
`;