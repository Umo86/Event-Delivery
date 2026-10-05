export function Mark({ dark = false }: { dark?: boolean }) {
  // A sign plate with a delivery tick: the product's mark.
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <rect x="1" y="1" width="32" height="32" rx="6" fill={dark ? '#13233b' : '#ffc20e'} />
      <path d="M9 17.5l5.2 5.2L25 11.8" fill="none" stroke={dark ? '#ffc20e' : '#13233b'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
