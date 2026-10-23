/**
 * Ochiul mic din avatarul Oracolului. Gradientul irisului (`#oIrisS`) e definit
 * în ochiul mare, din `OracleEye`, și se folosește de aici prin id.
 */
export function MiniEye({ size }: { size: number }) {
  return (
    <svg className="oMini" viewBox="-60 -60 120 120" width={size} height={size}>
      <circle className="es-ring" r="55" />
      <g className="es-lid">
        <path className="es-alm" d="M-46 0C-27-30 27-30 46 0C27 30-27 30-46 0Z" />
        <g className="es-iris">
          <circle r="18" fill="url(#oIrisS)" />
          <ellipse rx="4" ry="12" fill="#070506" />
          <circle cx="-6" cy="-7" r="3" fill="#FFFFFF" opacity=".85" />
        </g>
      </g>
    </svg>
  );
}

/** Avatarul rotund cu ochiul mic, ca în designul chatului. */
export function Avatar({ size }: { size: 28 | 38 }) {
  return (
    <span
      className="oAv"
      aria-hidden="true"
      style={size === 38 ? { width: "46px", height: "46px", boxShadow: "0 0 24px -6px rgba(255,107,61,.65)" } : undefined}
    >
      <MiniEye size={size} />
    </span>
  );
}
