/**
 * ℛ(t) — the official Resurrection Tech™ mark.
 * Reproduces the approved logo asset exactly (italic serif ℛ + mono "(t)").
 * Inherits color via `fill="currentColor"`-driven CSS so it stays crisp
 * at any size. No glow, no animation, aspect ratio preserved.
 */
export function Logo({
  height = 22,
  className = "",
  title = "Resurrection Tech",
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 40"
      height={height}
      width={(height * 96) / 40}
      role="img"
      aria-label={title}
      className={className}
      style={{ display: "block", flex: "none" }}
    >
      <text
        x="0"
        y="31"
        fontFamily="Georgia, 'Times New Roman', 'Noto Serif', serif"
        fontStyle="italic"
        fontWeight={600}
        fontSize={40}
        fill="currentColor"
      >
        &#8475;
      </text>
      <text
        x="44"
        y="31"
        fontFamily="'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace"
        fontWeight={500}
        fontSize={27}
        fill="currentColor"
      >
        (t)
      </text>
    </svg>
  );
}
