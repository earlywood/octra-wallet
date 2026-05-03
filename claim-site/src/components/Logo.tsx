interface Props { size?: number }

// Composite (Octra ring + AC ski mask) baked at build time by
// claim-site/scripts/gen-icons.mjs into public/favicon-256.png.
export function Logo({ size = 28 }: Props) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon-256.png`}
      width={size}
      height={size}
      alt=""
      style={{ display: 'inline-block', flexShrink: 0 }}
    />
  );
}
