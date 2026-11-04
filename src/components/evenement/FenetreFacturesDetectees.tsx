"use client";

import { useEffect, useState } from "react";
import { formatEuros } from "@/lib/format";
import { bouton, champ, nomContact, nombre, type ContactEvenement } from "@/lib/evenement";

export const NOUVEAU_FOURNISSEUR = "__nouveau__";

/** Une facture détectée dans le document, modifiable avant sa création. */
export type CarteFacture = {
  fournisseur_id: string;
  nv_entreprise: string;
  nv_nom: string;
  nv_prenom: string;
  a_verifier: boolean;
  fournisseur_lu: string;
  date: string;
  numero: string;
  montant: string;
  libelle: string;
  pages: number[];
};

/** Réglages communs aux factures créées ensemble. */
export type CommunFactures = { categorie_id: string; evenement_id: string; domaine: "ecole" | "evenement" };

/** « 1, 2, 3, 5 » → « Pages 1 à 3, 5 ». */
function libellePages(pages: number[]) {
  if (!pages.length) return "Document entier";
  const tries = [...new Set(pages)].sort((a, b) => a - b);
  const plages: string[] = [];
  for (let i = 0; i < tries.length; i++) {
    const debut = tries[i];
    while (tries[i + 1] === tries[i] + 1) i++;
    plages.push(debut === tries[i] ? String(debut) : `${debut} à ${tries[i]}`);
  }
  return `${tries.length > 1 ? "Pages" : "Page"} ${plages.join(", ")}`;
}

/**
 * Le document réunit plusieurs factures distinctes : synthèse à vérifier, puis création de chacune (avec ses seules
 * pages pour un PDF), ou retour à une seule facture si la détection s'est trompée.
 */
export default function FenetreFacturesDetectees({
  initiales,
  commun: communInitial,
  fournisseurs,
  fournisseurFixe,
  categories,
  evenements,
  domainesGerables,
  nomFichier,
  occupe,
  erreur,
  onCreer,
  onUneSeule,
  onAnnuler,
}: {
  initiales: CarteFacture[];
  commun: CommunFactures;
  fournisseurs: ContactEvenement[];
  fournisseurFixe: boolean;
  categories: { id: string; nom: string }[];
  evenements: { id: string; nom: string }[];
  domainesGerables: ("ecole" | "evenement")[];
  nomFichier: string;
  occupe: boolean;
  erreur: string | null;
  onCreer: (cartes: CarteFacture[], commun: CommunFactures) => void;
  onUneSeule: (cartes: CarteFacture[]) => void;
  onAnnuler: () => void;
}) {
  const [cartes, setCartes] = useState(initiales);
  const [commun, setCommun] = useState(communInitial);
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && onAnnuler();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onAnnuler]);

  const maj = (i: number, p: Partial<CarteFacture>) => setCartes((cs) => cs.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const total = cartes.reduce((s, c) => s + (nombre(c.montant) ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Plusieurs factures détectées"
        onSubmit={(e) => {
          e.preventDefault();
          onCreer(cartes, commun);
        }}
        className="mx-auto my-6 max-w-3xl space-y-4 rounded-xl border border-border bg-background p-5"
      >
        <div>
          <h2 className="text-lg font-semibold">{cartes.length} factures détectées</h2>
          <p className="truncate text-sm text-muted">Dans « {nomFichier} ». Vérifiez-les avant de les créer : chacune deviendra une facture distincte.</p>
        </div>

        {cartes.map((c, i) => (
          <section key={i} aria-label={`Facture ${i + 1}`} className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">Facture {i + 1}</h3>
              <span className="text-xs text-muted">{libellePages(c.pages)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {!fournisseurFixe && (
                <div className="space-y-1 sm:col-span-2">
                  <select
                    required
                    aria-label="Fournisseur"
                    value={c.fournisseur_id}
                    onChange={(e) => maj(i, { fournisseur_id: e.target.value, a_verifier: false })}
                    className={`${champ} ${c.a_verifier ? "border-amber-400" : ""}`}
                  >
                    <option value="">Fournisseur…</option>
                    <option value={NOUVEAU_FOURNISSEUR}>+ Nouveau fournisseur</option>
                    {fournisseurs.map((x) => (
                      <option key={x.id} value={x.id}>
                        {nomContact(x)}
                      </option>
                    ))}
                  </select>
                  {c.a_verifier && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      À vérifier{c.fournisseur_lu ? ` : lu sur la facture « ${c.fournisseur_lu} »` : ""}.{" "}
                      <button type="button" className="text-accent hover:underline" onClick={() => maj(i, { a_verifier: false })}>
                        Confirmer
                      </button>
                    </p>
                  )}
                </div>
              )}
              {c.fournisseur_id === NOUVEAU_FOURNISSEUR && (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                  <input aria-label="Entreprise" placeholder="Entreprise" value={c.nv_entreprise} onChange={(e) => maj(i, { nv_entreprise: e.target.value })} className={champ} />
                  <input aria-label="Nom" placeholder="Nom" value={c.nv_nom} onChange={(e) => maj(i, { nv_nom: e.target.value })} className={champ} />
                  <input aria-label="Prénom" placeholder="Prénom" value={c.nv_prenom} onChange={(e) => maj(i, { nv_prenom: e.target.value })} className={champ} />
                </div>
              )}
              <input required aria-label="Date de la facture" type="date" value={c.date} onChange={(e) => maj(i, { date: e.target.value })} className={champ} />
              <input aria-label="N° de facture" placeholder="N° de facture" value={c.numero} onChange={(e) => maj(i, { numero: e.target.value })} className={champ} />
              <input required aria-label="Montant TTC" inputMode="decimal" placeholder="Montant TTC (€)" value={c.montant} onChange={(e) => maj(i, { montant: e.target.value })} className={champ} />
              <input aria-label="Libellé" placeholder="Libellé court" value={c.libelle} onChange={(e) => maj(i, { libelle: e.target.value })} className={champ} />
            </div>
          </section>
        ))}

        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted">Total des {cartes.length} factures</span>
          <span className="text-lg font-semibold tabular-nums">{formatEuros(total)}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label="Catégorie de dépense" value={commun.categorie_id} onChange={(e) => setCommun({ ...commun, categorie_id: e.target.value })} className={champ}>
            <option value="">Catégorie…</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
          <select aria-label="Événement" value={commun.evenement_id} onChange={(e) => setCommun({ ...commun, evenement_id: e.target.value })} className={champ}>
            <option value="">Aucun événement</option>
            {evenements.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
          {domainesGerables.length > 1 && (
            <select aria-label="Domaine" value={commun.domaine} onChange={(e) => setCommun({ ...commun, domaine: e.target.value as "ecole" | "evenement" })} className={champ}>
              <option value="evenement">Événement</option>
              <option value="ecole">École</option>
            </select>
          )}
        </div>

        {erreur && <p role="alert" className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={occupe} className={bouton}>
            {occupe ? "Création…" : `Créer ${cartes.length} factures`}
          </button>
          <button type="button" disabled={occupe} onClick={() => onUneSeule(cartes)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
            C&apos;est une seule facture
          </button>
          <button type="button" disabled={occupe} onClick={onAnnuler} className="text-sm text-muted hover:underline">
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}
