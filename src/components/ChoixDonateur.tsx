"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";
import { formatEuros } from "@/lib/format";
import { cleDonateur, nomDonateur } from "@/lib/statutDon";
import type { Don } from "@/components/GestionDons";

/** Champs d'identité partagés par la fiche donateur, quel que soit l'écran. */
export type IdentiteSaisie = {
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  categorie_donateur: string;
};

export function identiteDepuisDon(d: Don): IdentiteSaisie {
  return {
    est_personne_morale: d.est_personne_morale,
    donateur_titre: d.donateur_titre ?? "",
    donateur_nom: d.donateur_nom ?? "",
    donateur_prenom: d.donateur_prenom ?? "",
    raison_sociale: d.raison_sociale ?? "",
    adresse: d.adresse ?? "",
    cp_ville: d.cp_ville ?? "",
    courriel: d.courriel ?? "",
    categorie_donateur: d.categorie_donateur ?? "Particulier",
  };
}

type Fiche = {
  cle: string;
  nom: string;
  exemple: Don;
  nbDons: number;
  total: number;
  dernier: string;
  complete: boolean;
};

/** Regroupe les dons par donateur, avec de quoi juger d'un coup d'œil. */
export function fichesDonateurs(dons: Don[]): Fiche[] {
  const map = new Map<string, Fiche>();
  for (const d of dons) {
    if (d.supprime_le) continue;
    const cle = cleDonateur(d);
    if (!cle) continue;
    const f = map.get(cle);
    if (f) {
      f.nbDons += 1;
      f.total += Number(d.montant);
      if (d.date_don > f.dernier) {
        f.dernier = d.date_don;
        f.exemple = d; // la fiche la plus récente fait foi
      }
    } else {
      map.set(cle, {
        cle,
        nom: nomDonateur(d) || "—",
        exemple: d,
        nbDons: 1,
        total: Number(d.montant),
        dernier: d.date_don,
        complete: !!(d.adresse && d.cp_ville),
      });
    }
  }
  for (const f of map.values()) {
    f.complete = !!(f.exemple.adresse && f.exemple.cp_ville);
  }
  return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Choix d'un donateur déjà connu, pour éviter de resaisir sa fiche.
 *
 * La sélection recopie l'identité dans le formulaire courant. Le bouton de mise
 * à jour propage ensuite l'identité corrigée à TOUS les dons du donateur : sans
 * cela, chaque don garderait sa copie, et les reçus fiscaux divergeraient.
 */
export default function ChoixDonateur({
  dons,
  valeurCourante,
  onChoisir,
  chiffrer,
  coffreOuvert,
}: {
  dons: Don[];
  /** Identité actuellement saisie, pour la propagation. */
  valeurCourante: IdentiteSaisie;
  onChoisir: (identite: IdentiteSaisie) => void;
  chiffrer: (texte: string) => Promise<string>;
  coffreOuvert: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [cleChoisie, setCleChoisie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fiches = useMemo(() => fichesDonateurs(dons), [dons]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return fiches.slice(0, 40);
    return fiches.filter((f) => f.nom.toLowerCase().includes(q)).slice(0, 40);
  }, [fiches, recherche]);

  function choisir(f: Fiche) {
    setCleChoisie(f.cle);
    setMessage(null);
    onChoisir(identiteDepuisDon(f.exemple));
    setOuvert(false);
  }

  /** Réécrit l'identité sur tous les dons du donateur sélectionné. */
  async function mettreAJourLaFiche() {
    if (!cleChoisie) return;
    if (!coffreOuvert) return setMessage("Coffre verrouillé : impossible de réécrire les fiches.");

    const concernes = dons.filter((d) => !d.supprime_le && cleDonateur(d) === cleChoisie);
    if (concernes.length === 0) return;

    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const v = valeurCourante;
    const pii = {
      titre: v.donateur_titre.trim() || null,
      nom: v.est_personne_morale ? v.raison_sociale.trim() : v.donateur_nom.trim(),
      prenom: v.donateur_prenom.trim() || null,
      raison: v.est_personne_morale ? v.raison_sociale.trim() : null,
      adresse: v.adresse.trim() || null,
      cp_ville: v.cp_ville.trim() || null,
      courriel: v.courriel.trim() || null,
    };
    const blob = await chiffrer(JSON.stringify(pii));

    const { error } = await supabase
      .from("dons")
      .update({
        pii_chiffre: blob,
        est_personne_morale: v.est_personne_morale,
        categorie_donateur: v.categorie_donateur || null,
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
      })
      .in(
        "id",
        concernes.map((d) => d.id),
      );

    setBusy(false);
    setMessage(
      error
        ? "Mise à jour impossible : " + error.message
        : `Fiche mise à jour sur ${concernes.length} don${concernes.length > 1 ? "s" : ""}.`,
    );
  }

  const nbConcernes = cleChoisie
    ? dons.filter((d) => !d.supprime_le && cleDonateur(d) === cleChoisie).length
    : 0;

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          🔍 Reprendre un donateur existant
        </button>

        {cleChoisie && (
          <button
            type="button"
            onClick={mettreAJourLaFiche}
            disabled={busy}
            title={`Réécrire l'identité sur les ${nbConcernes} dons de ce donateur`}
            className="rounded-lg border border-gold/50 bg-gold-soft/40 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold-soft disabled:opacity-50"
          >
            {busy ? "Mise à jour…" : `✎ Mettre à jour la fiche (${nbConcernes} dons)`}
          </button>
        )}

        {message && <span className="text-xs text-muted">{message}</span>}
      </div>

      {ouvert && (
        <div className="mt-3 space-y-2">
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un donateur…"
            className={inputCls}
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface">
            {filtrees.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">Aucun donateur trouvé.</p>
            ) : (
              filtrees.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  onClick={() => choisir(f)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                >
                  <span>
                    <span className="font-medium">{f.nom}</span>
                    {!f.complete && (
                      <span className="ml-2 rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                        adresse incomplète
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted">
                    {f.nbDons} don{f.nbDons > 1 ? "s" : ""} · {formatEuros(f.total)}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="text-xs text-muted">
            La sélection recopie l&apos;identité dans le formulaire. Le montant et la date ne sont pas
            touchés.
          </p>
        </div>
      )}
    </div>
  );
}
