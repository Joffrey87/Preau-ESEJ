"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ConsoClaude, { BarreCredit, montant } from "@/components/ConsoClaude";
import BarreCreditsNetlify from "@/components/BarreCreditsNetlify";

type Somme = { usd: number; eur: number };

/** Tableau de bord du Webmestre : coût Claude du mois (en €) et barre du crédit total ; le détail s'ouvre dans une fenêtre. */
export default function CarteConsoClaude({ mois, total }: { mois: Somme; total: Somme }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  const chiffre = (label: string, v: Somme) => (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{montant(v.eur, "€")}</dd>
    </div>
  );

  return (
    <section className="mb-9">
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Icon name="chart" className="h-[18px] w-[18px]" />
            </div>
            <div className="font-medium">Crédit Claude consommé</div>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {chiffre("Ce mois-ci", mois)}
          </dl>
          <BarreCredit consomme={Number(total.eur)} />
          <button type="button" onClick={() => setOuvert(true)} className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft">
            Voir le détail
          </button>
        </div>
        <BarreCreditsNetlify />
      </div>

      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" onClick={() => setOuvert(false)}>
          <div role="dialog" aria-modal="true" aria-label="Crédit Claude consommé" className="relative mx-auto my-6 max-w-4xl rounded-xl border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="absolute right-3 top-3 rounded-md px-2 py-1 text-muted hover:bg-surface-2">
              ✕
            </button>
            <ConsoClaude />
          </div>
        </div>
      )}
    </section>
  );
}
