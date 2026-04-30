interface AuraLogoProps {
  size?: number;
  className?: string;
}

export function AuraLogo({ size = 28, className }: AuraLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="aura-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      {/* Incomplete circle = the aura */}
      <path
        d="M16 4 A12 12 0 1 1 6.5 23.5"
        stroke="url(#aura-grad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Typing cursor */}
      <rect x="14.5" y="10" width="3" height="12" rx="0.5" fill="url(#aura-grad)">
        <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}
