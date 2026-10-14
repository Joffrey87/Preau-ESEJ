"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Demande de reçu fiscal enregistrée sur un don (qui, quand). */
export type DemandeRecu = { don_id: string; demande_par: string | null; demande_role: string | null; demande_le: string };

/** Alerte « infos donateur modifiées » par la Recherche de fonds. */
export type AlerteDonateur = {
  id: string;
  don_id: string;
  changements: { champ: string; avant?: string | null; apres?: string | null }[];
  par: string | null;
  le: string;
};

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Icône « Demande de reçu fiscal au Trésorier » : courte flèche vers une silhouette. */
export function IconeDemandeRecu({ className = "h-4 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h10" />
      <path d="M9.5 8l3.5 4-3.5 4" />
      <circle cx="22" cy="7" r="3.2" />
      <path d="M16.5 20.5v-1.5a5.5 5.5 0 0 1 11 0v1.5" />
    </svg>
  );
}

/** Recherche de fonds : bascule la demande (normal → ambre « demandée » → normal) ; verte une fois le reçu établi. */
export function BoutonDemandeRecu({
  donId, demande, etabli, prenom,
}: { donId: string; demande: DemandeRecu | null; etabli: boolean; prenom: string | null }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (etabli) {
    return (
      <span className="inline-flex align-middle text-positive" title="Reçu fiscal établi par le Trésorier">
        <IconeDemandeRecu />
      </span>
    );
  }
  async function basculer() {
    setEnCours(true);
    setErreur(null);
    const { error } = await createClient().rpc("dons_basculer_demande_recu", { p_don: donId, p_prenom: prenom });
    setEnCours(false);
    if (error) return setErreur(error.message);
    router.refresh();
  }
  const titre = erreur
    ?? (demande
      ? `Reçu fiscal demandé au Trésorier${demande.demande_par ? ` par ${demande.demande_par}` : ""} le ${quand(demande.demande_le)} — cliquer pour annuler`
      : "Demande de reçu fiscal au Trésorier");
  return (
    <button
      type="button"
      onClick={() => void basculer()}
      disabled={enCours}
      title={titre}
      aria-label={titre}
      aria-pressed={!!demande}
      className={`inline-flex align-middle disabled:opacity-50 ${erreur ? "text-negative" : demande ? "text-gold" : "text-muted hover:text-accent"}`}
    >
      <IconeDemandeRecu />
    </button>
  );
}

/** Trésorier : pastille ambre « Demande de reçu fiscal · Prénom » sur la ligne du don. */
export function PastilleDemandeRecu({ demande, onClick }: { demande: DemandeRecu; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Demandé le ${quand(demande.demande_le)} — cliquer pour établir le reçu`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold hover:opacity-90"
    >
      <IconeDemandeRecu className="h-3.5 w-4" />
      Demande de reçu fiscal{demande.demande_par ? ` · ${demande.demande_par}` : ""}
    </button>
  );
}

const LIBELLE_CHAMP: Record<string, string> = { relation: "Relation", courriel: "Courriel", telephone: "Téléphone" };

/** Trésorier : alerte ambre « infos donateur modifiées », avec le détail et « Vu ». */
export function AlerteInfosDonateur({ donId, alertes }: { donId: string; alertes: AlerteDonateur[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  async function vu() {
    setEnCours(true);
    const { error } = await createClient().rpc("dons_alertes_vues", { p_don: donId });
    setEnCours(false);
    if (!error) router.refresh();
  }
  const detail = alertes
    .map((a) => `${a.par ?? "Recherche de fonds"} le ${quand(a.le)} : ${a.changements.map((c) =>
      c.avant !== undefined || c.apres !== undefined
        ? `${LIBELLE_CHAMP[c.champ] ?? c.champ} « ${c.avant || "—"} » → « ${c.apres || "—"} »`
        : `${LIBELLE_CHAMP[c.champ] ?? c.champ} modifié`).join(", ")}`)
    .join("\n");
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        title={detail}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/50 bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold"
      >
        ⚠ Infos donateur modifiées
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-surface p-3 text-left text-xs shadow-lg">
            <p className="whitespace-pre-line">{detail}</p>
            <div className="mt-2 text-right">
              <button type="button" onClick={() => void vu()} disabled={enCours}
                className="rounded-md bg-accent px-2.5 py-1 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                {enCours ? "…" : "Vu"}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}
