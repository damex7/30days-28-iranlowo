// A hand-drawn mark: a speech bubble whose tail is tied in a small knot,
// a nod to a promise kept ("we'll get back to you"). Strokes are slightly
// uneven on purpose so it reads as drawn, not stamped.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path
        d="M9.5 10.8c4.6-3.9 11.4-5 17.6-4.4 6.9.7 12.6 4.4 13.6 10.6 1.1 6.6-3.1 12.4-9.6 14.4-3.4 1-7.1 1.2-10.5.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.1"
        strokeLinecap="round"
      />
      <path
        d="M9.5 10.8c-3.6 3.1-4.9 8.3-3.4 12.6 1.2 3.4 3.9 5.6 7.3 6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* the knot: a small loop where the tail turns */}
      <path
        d="M13.4 30.2c-1.6 2.9-.4 5.7 2.2 5.4 2.4-.3 2.9-3.5.7-4.4-2.3-1-4.6 1.6-5.3 4.9-.4 2-.9 3.7-2.2 5.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 18.6c3.6-.4 9.8-.6 14.2-.1M17.4 23.4c2.9-.2 6.2-.2 8.6 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}
