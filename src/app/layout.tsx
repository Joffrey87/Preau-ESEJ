import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import ThemeApplique from "@/components/ThemeApplique";
import { SCRIPT_THEME } from "@/lib/theme";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Préau",
  description:
    "Préau — gestion de la trésorerie de l'ARIL, École du Saint-Enfant-Jésus, Reims.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning : le script de <head> pose data-theme avant React.
    <html lang="fr" className={`${montserrat.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Exécuté au chargement seulement : inerte (text/plain) lors d'un rendu côté client. */}
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: SCRIPT_THEME }}
        />
      </head>
      <body className="min-h-full">
        <ThemeApplique />
        {children}
      </body>
    </html>
  );
}
