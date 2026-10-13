"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import GestionPipeline from "@/components/GestionPipeline";
import DonateursPipeline from "@/components/DonateursPipeline";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";
import type { SuiviAction } from "@/lib/suiviDonateurs";

type Volet = "fichier" | "prospections" | "campagnes";

const VOLETS: { v: Volet; l: string }[] = [
  { v: "fichier", l: "Fichier donateurs" },
  { v: "prospections", l: "Prospections" },
  { v: "campagnes", l: "Campagnes de collecte" },
];

/**
 * Relations donateurs, en trois volets : le fichier des donateurs (qualifiés
 * depuis les dons, filtres), les prospections (suivi relationnel) et les
 * campagnes de collecte (objectif, relances, actions suggérées).
 */
type Props = {
  prospects: Prospect[];
  dons: Don[];
  obtenus?: Record<string, { montant: number; nb: number }>;
  /** Écriture sur les dons (même règle que la base : Trésorier). */
  peutModifierDons?: boolean;
  suivi?: SuiviAction[];
  peutSuivre?: boolean;
  auteurSuivi?: string | null;
  /** Création / modification des prospects (bureau et Recherche de fonds). */
  peutEcrireProspects?: boolean;
  peutLier?: boolean;
};

/**
 * Les liens du menu « Mises à jour » ouvrent directement le bon endroit : `?volet=prospections`, `?filtre=alentours&carte=1`,
 * `?filtre=bourse`, `?liste=Liste Axel`. Chaque adresse différente recrée l'écran avec ces réglages de départ.
 */
export default function PipelineTabs(props: Props) {
  const params = useSearchParams();
  return <PipelineTabsContenu key={params.toString()} {...props} />;
}

function PipelineTabsContenu({ prospects, dons, obtenus, peutLier, peutModifierDons = false, suivi = [], peutSuivre = false, auteurSuivi = null, peutEcrireProspects = false }: Props) {
  const params = useSearchParams();
  const voletParam = params.get("volet");
  const [vue, setVue] = useState<Volet>(
    voletParam === "prospections" || voletParam === "campagnes" ? voletParam : "fichier",
  );
  const filtre = params.get("filtre");

  return (
    <div className="space-y-2">
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
        {VOLETS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVue(o.v)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              vue === o.v ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>

      {vue === "prospections" ? (
        <GestionPipeline prospects={prospects} dons={dons} obtenus={obtenus} peutLier={peutLier} listeInitiale={params.get("liste")} suivi={suivi} peutSuivre={peutSuivre} auteurSuivi={auteurSuivi} peutEcrire={peutEcrireProspects} />
      ) : (
        <DonateursPipeline donsInit={dons} peutModifierDons={peutModifierDons} suivi={suivi} peutSuivre={peutSuivre} auteurSuivi={auteurSuivi} volet={vue} filtreInitial={filtre} carteInitiale={params.get("carte") === "1"} />
      )}
    </div>
  );
}
