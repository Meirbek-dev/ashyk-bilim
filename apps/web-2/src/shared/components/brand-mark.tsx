/** The logomark: two ornament curls around a centre stud (the cover ornament's tile), on primary. */
export function BrandMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M16 5A11 11 0 0 1 5 16M27 16A11 11 0 0 0 16 27"
        className="fill-none stroke-primary-foreground"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.2" className="fill-primary-foreground" />
    </svg>
  )
}
