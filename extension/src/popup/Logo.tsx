interface Props { size?: number; color?: string }

export function Logo({ size = 22, color = '#0000DB' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="25" cy="25" r="21" stroke={color} strokeWidth="8" />
    </svg>
  );
}
