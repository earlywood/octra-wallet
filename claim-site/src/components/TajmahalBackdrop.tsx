// Subtle full-viewport image backdrop for the o2e claim flow. Sits behind
// everything via z-index 0, no pointer events. Heavy dim + blur so card
// content stays readable.
export function TajmahalBackdrop() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundImage: `url(${import.meta.env.BASE_URL}tajmahal.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        opacity: 0.16,
        filter: 'blur(1.5px) saturate(0.85)',
      }}
    />
  );
}
