// components/calendar-embed.tsx
interface CalendarEmbedProps {
  calendarUrl: string;
}

export default function CalendarEmbed({ calendarUrl }: CalendarEmbedProps) {
  return (
    <div className="sc-cal">
      <iframe src={calendarUrl} title="Select Viewing Slot" loading="lazy" />
    </div>
  );
}