"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/roles";

/** Profils qui posent (ou retirent) la médaille sur le tableau physique des dons. */
export const ROLES_MEDAILLE = ["tresorier", "directrice", "directeur-spirituel"];

function infobulle(affichee: boolean, par: string | null | undefined, le: string | null | undefined) {
  if (!affichee) return "Médaille pas encore posée sur le tableau des dons";
  const quand = le
    ? new Date(le).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  return `Médaille posée sur le tableau des dons${par ? ` — cochée par ${par}` : ""}${quand ? ` le ${quand}` : ""}`;
}

/** Médaille Miraculeuse (cochée) ou ovale vide (non cochée), 26 px de haut. */
export function IconeMedaille({ affichee }: { affichee: boolean }) {
  return affichee ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/medaille-32.png" srcSet="/medaille-32.png 1x, /medaille-64.png 2x" alt="Médaille posée" width={17} height={26} className="h-[26px] w-auto" />
  ) : (
    <svg viewBox="0 0 17 26" width={17} height={26} aria-hidden="true" className="text-muted">
      <ellipse cx="8.5" cy="14.5" rx="7.5" ry="10.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" />
    </svg>
  );
}

export default function MedailleDon({
  donId, affichee, par, le, roleSlug,
}: { donId: string; affichee: boolean; par?: string | null; le?: string | null; roleSlug: string | null }) {
  const [etat, setEtat] = useState({ affichee, par: par ?? null, le: le ?? null });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const peutModifier = !!roleSlug && ROLES_MEDAILLE.includes(roleSlug);
  const titre = erreur ?? infobulle(etat.affichee, etat.par, etat.le);

  if (!peutModifier) {
    return <span title={titre} className="inline-flex"><IconeMedaille affichee={etat.affichee} /></span>;
  }

  async function basculer() {
    const suivant = !etat.affichee;
    const auteur = ROLES.find((r) => r.slug === roleSlug)?.label ?? roleSlug!;
    setEnCours(true);
    setErreur(null);
    const { error } = await createClient().rpc("definir_medaille_don", { p_id: donId, p_affichee: suivant, p_par: auteur });
    setEnCours(false);
    if (error) return setErreur(`Erreur : ${error.message}`);
    setEtat(suivant ? { affichee: true, par: auteur, le: new Date().toISOString() } : { affichee: false, par: null, le: null });
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={etat.affichee}
      aria-label="Médaille posée sur le tableau des dons"
      title={titre}
      disabled={enCours}
      onClick={() => void basculer()}
      className={`inline-flex rounded transition hover:scale-110 disabled:opacity-50 ${erreur ? "ring-1 ring-negative" : ""}`}
    >
      <IconeMedaille affichee={etat.affichee} />
    </button>
  );
}
