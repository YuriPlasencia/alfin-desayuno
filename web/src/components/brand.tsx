/** Marca de Juntada: la pizarra con dos imanes. */
export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="3" y="5" width="26" height="20" rx="3" fill="#fff" />
          <path d="M8 12h9M8 17h6" stroke="#1D3FBF" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="22.5" cy="11.5" r="3.2" fill="#E5483A" />
          <circle cx="21" cy="19" r="3.2" fill="#F2B21B" />
          <path d="M11 25v3M21 25v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="brand-text">
        <strong>Juntada</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
    </div>
  )
}
