"use client";

import { useSyncExternalStore } from "react";
import { abonnerTheme, choisirTheme, lireTheme, type Theme } from "@/lib/theme";

const OPTIONS: { v: Theme; l: string; aide: string }[] = [
  { v: "auto", l: "Automatique", aide: "Suit le réglage de l'appareil" },
  { v: "clair", l: "Clair", aide: "Crème et marine" },
  { v: "sombre", l: "Sombre", aide: "Nuit marine" },
];

/** Choix du thème d'affichage, mémorisé sur cet appareil. */
export default function ChoixTheme() {
  // Côté serveur : « auto » ; le choix réel est lu dès l'hydratation.
  const theme = useSyncExternalStore(abonnerTheme, lireTheme, () => "auto" as Theme);

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Affichage</h2>
        <p className="mt-1 text-xs text-muted">Thème de l&apos;application, mémorisé sur cet appareil.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div role="radiogroup" aria-label="Thème" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const actif = theme === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => choisirTheme(o.v)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  actif ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"
                }`}
              >
                <Apercu theme={o.v} />
                <span>
                  <span className={`block text-sm font-medium ${actif ? "text-accent" : ""}`}>{o.l}</span>
                  <span className="block text-xs text-muted">{o.aide}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Vignette aux couleurs du thème (moitié clair / moitié sombre en automatique). */
function Apercu({ theme }: { theme: Theme }) {
  const clair = (
    <span className="flex h-full flex-1 flex-col gap-1 bg-[#f7f3ea] p-1">
      <span className="h-1.5 w-3/4 rounded-sm bg-[#021d51]" />
      <span className="h-1.5 w-1/2 rounded-sm bg-[#c8952f]" />
    </span>
  );
  const sombre = (
    <span className="flex h-full flex-1 flex-col gap-1 bg-[#0a0f1f] p-1">
      <span className="h-1.5 w-3/4 rounded-sm bg-[#7ea0e0]" />
      <span className="h-1.5 w-1/2 rounded-sm bg-[#d9ad5a]" />
    </span>
  );
  return (
    <span aria-hidden className="flex h-9 w-12 shrink-0 overflow-hidden rounded-md border border-border">
      {theme === "sombre" ? sombre : clair}
      {theme === "auto" && sombre}
    </span>
  );
}
