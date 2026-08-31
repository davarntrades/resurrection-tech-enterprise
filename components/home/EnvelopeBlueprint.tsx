export function EnvelopeBlueprint() {
  return (
    <figure className="bp-envelope" aria-labelledby="bp-envelope-title bp-envelope-desc">
      <svg viewBox="0 0 760 430" role="img">
        <title id="bp-envelope-title">Admissible Operating Envelope state-space diagram</title>
        <desc id="bp-envelope-desc">
          A trajectory moves through a permitted region. A proposed branch toward prohibited region Omega
          terminates at the operating boundary before execution.
        </desc>
        <defs>
          <pattern id="bpMinorGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" className="bp-svg-grid-minor" />
          </pattern>
          <pattern id="bpMajorGrid" width="96" height="96" patternUnits="userSpaceOnUse">
            <rect width="96" height="96" fill="url(#bpMinorGrid)" />
            <path d="M96 0H0V96" className="bp-svg-grid-major" />
          </pattern>
          <marker id="bpArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10Z" className="bp-svg-arrow" />
          </marker>
          <clipPath id="bpEnvelopeClip">
            <path d="M96 308C69 235 99 125 196 83C293 41 446 56 546 111C638 162 684 247 628 326C574 402 440 383 342 369C246 355 128 395 96 308Z" />
          </clipPath>
        </defs>

        <rect x="1" y="1" width="758" height="428" className="bp-svg-frame" />
        <rect x="28" y="28" width="704" height="352" fill="url(#bpMajorGrid)" />
        <path d="M28 380H733M28 380V28" className="bp-svg-axis" />
        <path d="M76 374V386M172 374V386M268 374V386M364 374V386M460 374V386M556 374V386M652 374V386" className="bp-svg-ticks" />
        <path d="M22 332H34M22 236H34M22 140H34M22 44H34" className="bp-svg-ticks" />

        <path
          d="M96 308C69 235 99 125 196 83C293 41 446 56 546 111C638 162 684 247 628 326C574 402 440 383 342 369C246 355 128 395 96 308Z"
          className="bp-svg-region"
        />
        <g clipPath="url(#bpEnvelopeClip)">
          <path d="M48 322C173 304 190 237 285 239C392 241 422 151 574 174C643 185 690 158 737 103" className="bp-svg-trajectory" markerEnd="url(#bpArrow)" />
          <path d="M285 239C372 246 468 282 548 337" className="bp-svg-proposal" />
        </g>

        <circle cx="285" cy="239" r="4" className="bp-svg-node" />
        <circle cx="548" cy="337" r="6" className="bp-svg-block" />
        <path d="M540 329L556 345M556 329L540 345" className="bp-svg-block-x" />
        <path d="M548 337L636 294" className="bp-svg-leader" />

        <text x="112" y="111" className="bp-svg-label bp-svg-label--strong">ADMISSIBLE REGION E</text>
        <text x="578" y="74" className="bp-svg-label bp-svg-label--omega">Ω</text>
        <text x="578" y="94" className="bp-svg-micro">PROHIBITED REGION</text>
        <text x="300" y="225" className="bp-svg-micro">x(t)</text>
        <text x="642" y="292" className="bp-svg-label bp-svg-label--omega">BLOCK</text>
        <text x="642" y="309" className="bp-svg-micro">∂E · OPERATING BOUNDARY</text>
        <text x="704" y="405" className="bp-svg-micro">STATE x₁</text>
        <text x="42" y="50" className="bp-svg-micro">STATE x₂</text>
      </svg>
      <figcaption>
        <span>PERMITTED REGION</span>
        <span>TRAJECTORY x(t)</span>
        <span>BOUNDARY ∂E</span>
        <span className="is-omega">PROHIBITED Ω</span>
      </figcaption>
    </figure>
  );
}
