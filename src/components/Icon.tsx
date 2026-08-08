import type { SVGProps } from "react";

// Jeu d'icônes minimal (style trait, viewBox 24). MIT — inspiré de Lucide.
const PATHS: Record<string, string> = {
  dashboard:
    "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  ledger:
    "M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Zm0 0v13m4-9h7M8 12h7",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  graduation: "M22 10 12 5 2 10l10 5 10-5Zm-4 2v5c0 1-3 2.5-6 2.5S6 20 6 17v-5",
  invoice:
    "M6 2h9l5 5v15H6V2Zm9 0v5h5M9 12h6M9 16h6M9 8h2",
  gift: "M20 12v9H4v-9M2 8h20v4H2V8Zm10 0v13M12 8S9 8 8 5.5 12 4 12 8Zm0 0s3 0 4-2.5S12 4 12 8Z",
  receipt:
    "M5 2v20l2-1.5L9 22l2-1.5L13 22l2-1.5L17 22l2-1.5V2l-2 1.5L15 2l-2 1.5L11 2 9 3.5 7 2 5 3.5M8 8h8M8 12h8",
  transfer: "M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  mail: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  check: "M4 4h16v16H4V4Zm4 8 3 3 5-6",
  users:
    "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1A4 4 0 0 1 16 11",
  calendar:
    "M4 5h16v16H4V5Zm0 5h16M8 3v4M16 3v4",
  book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3V4Zm14 3v13",
  logout: "M15 3h5v18h-5M11 16l4-4-4-4M15 12H3",
  contact:
    "M4 5h16v14H4V5Zm4.5 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM6 16c0-1.6 1.2-2.5 2.5-2.5S11 14.4 11 16M14 9.5h4M14 13h3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.5 2",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2l-.4-2.5H8.5l-.4 2.5a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2 1.2l.4 2.5h6.9l.4-2.5a7.3 7.3 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z",
};

type IconProps = SVGProps<SVGSVGElement> & { name: keyof typeof PATHS | string };

export default function Icon({ name, ...props }: IconProps) {
  const d = PATHS[name] ?? PATHS.dashboard;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={d} />
    </svg>
  );
}
