/**
 * Inline icon set. Kept in one file so stroke weight and grid stay consistent;
 * every glyph is drawn on a 20x20 box at 1.5px stroke unless noted.
 */
type IconProps = {
  size?: number;
  className?: string;
};

function svgProps(size: number, className?: string) {
  return {
    "aria-hidden": true as const,
    viewBox: "0 0 20 20",
    width: size,
    height: size,
    className,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function SearchIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.75 12.75 3.75 3.75" />
    </svg>
  );
}

export function CloseIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={1.8}>
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function InfoIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={1.4}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 9v4.75" />
      <circle cx="10" cy="6.2" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LinkIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8.5 11.5a3.2 3.2 0 0 0 4.6 0l2.4-2.4a3.25 3.25 0 0 0-4.6-4.6l-1 1" />
      <path d="M11.5 8.5a3.2 3.2 0 0 0-4.6 0l-2.4 2.4a3.25 3.25 0 0 0 4.6 4.6l1-1" />
    </svg>
  );
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={2}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

export function AlertIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={1.8}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 6v5" />
      <circle cx="10" cy="13.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SunIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.75v2M10 16.25v2M1.75 10h2M16.25 10h2M4.15 4.15l1.4 1.4M14.45 14.45l1.4 1.4M15.85 4.15l-1.4 1.4M5.55 14.45l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M15.9 13.3A7 7 0 0 1 6.7 4.1a6.7 6.7 0 1 0 9.2 9.2Z" />
    </svg>
  );
}

export function ExternalIcon({ size = 11, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={1.8}>
      <path d="M7 4h9v9M16 4 5 15" />
    </svg>
  );
}
