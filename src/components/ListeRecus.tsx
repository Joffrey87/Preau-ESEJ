"use client";

import GenererRecuBouton from "@/components/GenererRecuBouton";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { formatEuros, formatDate } from "@/lib/format";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { useMemo, useState } from "react";
import { cleDonateur, champsImportantsManquants, recuEnvoye, sansRecu } from "@/lib/statutDon";
import type { DonPourRecu } from "@/lib/recu";

export type DonRow = {
  id: string;
  date_don: string;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  est_personne_morale: boolean;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  pii_chiffre: string | null;
  montant: number;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
};

type Groupe = {
  cle: string;
  numero: string | null;
  annee: number;
  total: number;
  nbVersements: number;
  dateMin: string;
  dateMax: string;
  representant: DonRow;
};

// Regroupe les versements par n° de reçu + année civile → un reçu annuel cumulé.
function grouper(dons: DonRow[]): Groupe[] {
  const map = new Map<string, DonRow[]>();
  for (const d of dons) {
    // Le donateur n'a pas demandé de reçu : rien à établir.
    if (sansRecu(d)) continue;
    const annee = d.date_don.slice(0, 4);
    const cle = d.recu_numero ? `${d.recu_numero}|${annee}` : `sans|${d.id}`;
    (map.get(cle) ?? map.set(cle, []).get(cle)!).push(d);
  }
  const groupes: Groupe[] = [];
  for (const [cle, rows] of map) {
    const tri = [...rows].sort((a, b) => a.date_don.localeCompare(b.date_don));
    const representant = tri[tri.length - 1];
    groupes.push({
      cle,
      numero: representant.recu_numero,
      annee: Number(representant.date_don.slice(0, 4)),
      total: rows.reduce((s, d) => s + Number(d.montant), 0),
      nbVersements: rows.length,
      dateMin: tri[0].date_don,
      dateMax: tri[tri.length - 1].date_don,
      representant,
    });
  }
  return groupes.sort((a, b) => b.dateMax.localeCompare(a.dateMax));
}

export type StatutRecu = "envoye" | "edite" | "attente" | "a_faire";

const LIBELLE: Record<StatutRecu, string> = {
  envoye: "Envoyé",
  edite: "Édité, à envoyer",
  attente: "Attente fin d'année",
  a_faire: "À établir",
};

const TON: Record<StatutRecu, string> = {
  envoye: "bg-positive/15 text-positive",
  edite: "bg-accent-soft text-accent",
  attente: "bg-gold-soft text-gold",
  a_faire: "bg-negative/10 text-negative",
};

/**
 * Où en est le reçu de ce groupe de versements ?
 *
 * Un donateur récurrent dont l'année n'est pas close n'est pas « à établir » :
 * son reçu attend la fin de l'année pour cumuler tous ses versements. Émettre
 * un reçu partiel obligerait à l'annuler au don suivant.
 */
function statutRecu(g: Groupe, recurrents: Set<string>, anneeEnCours: number): StatutRecu {
  if (recuEnvoye(g.representant)) return "envoye";
  if (g.numero) return "edite";
  const recurrent = g.nbVersements > 1 || recurrents.has(cleDonateur(g.representant));
  return recurrent && g.annee >= anneeEnCours ? "attente" : "a_faire";
}

const nomAffiche = (d: DonRow) =>
  d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? "—"
    : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ") || "—";

function donPourRecu(g: Groupe): DonPourRecu {
  const r = g.representant;
  const dateAffichee =
    g.nbVersements > 1 ? `du ${formatDate(g.dateMin)} au ${formatDate(g.dateMax)}` : formatDate(g.dateMax);
  return {
    recu_numero: r.recu_numero,
    donateur_titre: r.donateur_titre,
    donateur_nom: r.donateur_nom ?? "",
    donateur_prenom: r.donateur_prenom,
    raison_sociale: r.raison_sociale,
    est_personne_morale: r.est_personne_morale,
    adresse: r.adresse,
    cp_ville: r.cp_ville,
    montant: g.total,
    date_don: r.date_don,
    mode_paiement: r.mode_paiement,
    date_affichee: dateAffichee,
  };
}

export default function ListeRecus({ dons }: { dons: DonRow[] }) {
  const { dons: hydrates, verrou } = useDonsDechiffres(dons);
  const [annee, setAnnee] = useState<number | "toutes">("toutes");
  const [statut, setStatut] = useState<StatutRecu | "tous">("tous");

  const anneeEnCours = new Date().getFullYear();

  // Un donateur est « récurrent » s'il a versé plusieurs fois, toutes années
  // confondues : c'est le signe qu'il donnera probablement encore cette année.
  const recurrents = useMemo(() => {
    const compte = new Map<string, number>();
    for (const d of hydrates) {
      const c = cleDonateur(d);
      if (c) compte.set(c, (compte.get(c) ?? 0) + 1);
    }
    return new Set([...compte].filter(([, n]) => n > 1).map(([c]) => c));
  }, [hydrates]);

  const tous = useMemo(
    () =>
      grouper(hydrates).map((g) => ({
        g,
        statut: statutRecu(g, recurrents, anneeEnCours),
        manquants: champsImportantsManquants(g.representant),
      })),
    [hydrates, recurrents, anneeEnCours],
  );

  const annees = useMemo(
    () => [...new Set(tous.map((x) => x.g.annee))].sort((a, b) => b - a),
    [tous],
  );

  // Le tableau de bord porte sur l'année choisie, la liste sur année + statut.
  const deLAnnee = tous.filter((x) => annee === "toutes" || x.g.annee === annee);
  const affiches = deLAnnee.filter((x) => statut === "tous" || x.statut === statut);

  const compte = (s: StatutRecu) => deLAnnee.filter((x) => x.statut === s).length;
  const somme = (s: StatutRecu) =>
    deLAnnee.filter((x) => x.statut === s).reduce((t, x) => t + x.g.total, 0);
  const incomplets = deLAnnee.filter((x) => x.statut !== "envoye" && x.manquants.length > 0).length;

  const tuiles: { cle: StatutRecu; libelle: string; ton: string }[] = [
    { cle: "a_faire", libelle: "À établir", ton: "text-negative" },
    { cle: "attente", libelle: "Attente fin d'année", ton: "text-gold" },
    { cle: "edite", libelle: "Édités, à envoyer", ton: "text-accent" },
    { cle: "envoye", libelle: "Envoyés", ton: "text-positive" },
  ];

  return (
    <>
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">🔒 Coffre verrouillé — noms masqués et génération de reçus indisponible.</span>
          <DeverrouillerCoffre />
        </div>
      )}
      {/* Tableau de bord */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tuiles.map((t) => (
          <button
            key={t.cle}
            type="button"
            onClick={() => setStatut(statut === t.cle ? "tous" : t.cle)}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              statut === t.cle ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"
            }`}
          >
            <div className="text-xs text-muted">{t.libelle}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${t.ton}`}>{compte(t.cle)}</div>
            <div className="text-xs text-muted tabular-nums">{formatEuros(somme(t.cle))}</div>
          </button>
        ))}
      </div>

      {incomplets > 0 && (
        <p className="mb-4 rounded-xl border border-negative/30 bg-negative/5 px-4 py-2.5 text-sm text-negative">
          {incomplets} reçu{incomplets > 1 ? "x" : ""} ne peu{incomplets > 1 ? "vent" : "t"} pas être
          établi{incomplets > 1 ? "s" : ""} : adresse, code postal ou courriel manquant.
        </p>
      )}

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Année</span>
          <button
            type="button"
            onClick={() => setAnnee("toutes")}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              annee === "toutes" ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
            }`}
          >
            Toutes
          </button>
          {annees.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnnee(a)}
              className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
                annee === a ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {statut !== "tous" && (
          <button type="button" onClick={() => setStatut("tous")} className="text-sm text-accent hover:underline">
            Afficher tous les statuts
          </button>
        )}

        <span className="ml-auto text-sm text-muted">
          {affiches.length} reçu{affiches.length > 1 ? "x" : ""} affiché{affiches.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Année</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-center">Versements</th>
              <th className="px-4 py-3 font-medium">N° reçu</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">Aucun reçu pour ce filtre.</td>
              </tr>
            ) : (
              affiches.map(({ g, statut: st, manquants }) => (
                <tr key={g.cle} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular-nums">{g.annee}</td>
                  <td className="px-4 py-3">{nomAffiche(g.representant)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatEuros(g.total)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted">{g.nbVersements}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{g.numero ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TON[st]}`}>
                      {LIBELLE[st]}
                    </span>
                    {st !== "envoye" && manquants.length > 0 && (
                      <span
                        className="ml-1.5 text-negative"
                        title={"Manque : " + manquants.join(", ")}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {verrou ? (
                      <span className="text-xs text-muted">🔒</span>
                    ) : (
                      <GenererRecuBouton don={donPourRecu(g)} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
