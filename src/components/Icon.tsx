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
  funnel: "M3 4h18l-7 8v7l-4 2v-9L3 4Z",
  crayon: "M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Zm11-13 4 4",
  "calendrier-alerte":
    "M4 5h16v16H4V5Zm0 5h16M8 3v4M16 3v4M12 13v3m0 3h.01",
  "calendrier-petit": "M4 5h16v16H4V5Zm0 5h16M8 3v4M16 3v4",
  ampoule:
    "M12 6.5a5 5 0 0 0-3.2 8.8c.5.4.8 1.1.8 1.8v.4h4.8v-.4c0-.7.3-1.4.8-1.8A5 5 0 0 0 12 6.5ZM9.6 20h4.8M10.6 22.3h2.8M12 1.6v2.1M4.7 4.6l1.5 1.5M19.3 4.6l-1.5 1.5M2.2 11.7h2.1M19.7 11.7h2.1",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v4m0-8h.01",
  maison: "M3 11 12 3l9 8M5 9.5V21h14V9.5M10 21v-6h4v6",
  plus: "M12 5v14M5 12h14",
  soleil: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    lune: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  corbeille: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  avancer: "M5 12h14M13 6l6 6-6 6",
  couronne: "M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11",
  portefeuille:
    "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h11M16.5 14h.01",
  bouclier: "M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z",
  croix: "M10 2h4v6h6v4h-6v10h-4V12H4V8h6V2Z",
  billets:
    "M2 9h16v10H2V9Zm5.5 5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0ZM5 6h16v10h-2M5 12h.01M15 12h.01",
  sceau:
    "M17 12V2.5H4v14h6.7M7 7h7M7 10.5h4M13.4 20.2 12.4 23.2l2.2-1.2M17.6 20.2l1 3-2.2-1.2M20.5 16.5L20.4 16.9L20.2 17.3L19.9 17.7L19.7 18.0L19.6 18.4L19.6 18.9L19.6 19.3L19.4 19.7L19.0 20.0L18.6 20.1L18.1 20.2L17.7 20.4L17.4 20.6L17.1 21.0L16.8 21.3L16.4 21.5L15.9 21.4L15.5 21.2L15.1 21.0L14.7 20.9L14.3 20.9L13.9 21.0L13.4 21.0L13.0 20.9L12.7 20.6L12.4 20.1L12.3 19.7L12.1 19.4L11.8 19.1L11.4 18.9L11.0 18.6L10.8 18.2L10.7 17.8L10.8 17.3L11.0 16.9L11.0 16.5L11.0 16.1L10.8 15.7L10.7 15.2L10.8 14.8L11.0 14.4L11.4 14.1L11.8 13.9L12.1 13.6L12.3 13.3L12.4 12.9L12.7 12.4L13.0 12.1L13.4 12.0L13.9 12.0L14.3 12.1L14.7 12.1L15.1 12.0L15.5 11.8L15.9 11.6L16.4 11.5L16.8 11.7L17.1 12.0L17.4 12.4L17.7 12.6L18.1 12.8L18.6 12.9L19.0 13.0L19.4 13.3L19.6 13.7L19.6 14.1L19.6 14.6L19.7 15.0L19.9 15.3L20.2 15.7L20.4 16.1ZM12.75 16.50a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0",
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
