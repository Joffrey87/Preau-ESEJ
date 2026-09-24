"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";
import { formatEuros } from "@/lib/format";
import { NATURES, libelleNature, type NatureAffectation } from "@/lib/scolariteDepots";

export type Inscription = {
  id: string;
  annee_scolaire: string;
  famille_nom: string;
  nb_enfants: number | null;
};

export type Affectation = {
  id: string;
  operation_id: string;
  inscription_id: string;
  montant: number;
  notes: string | null;
  nature?: NatureAffectation;
};

/** Catégories ouvrant le fléchage vers une famille. */
export const CAT_DON_ASSOCIATION = "Don d'Association";
export const CAT_SCOLARITE = "Paiement frais de scolarité";
export const CAT_MOIS_AVANCE = "Mois d'avance (dépôts)";
export const CAT_FRAIS_DOSSIER = "Frais de dossier";

/**
 * La catégorie fait la case du Bilan, la nature fait la colonne de l'onglet
 * Frais de scolarité : les deux vont ensemble. Une écriture de scolarité est
 * une mensualité, un dépôt ou des frais de dossier selon sa catégorie.
 */
const NATURE_PAR_CATEGORIE: Record<string, NatureAffectation> = {
  [CAT_SCOLARITE]: "mensualite",
  [CAT_MOIS_AVANCE]: "mois_avance",
  [CAT_FRAIS_DOSSIER]: "frais_dossier",
};
export const CATS_SCOLARITE = Object.keys(NATURE_PAR_CATEGORIE);

/** Nature imposée par la catégorie de l'écriture (null : catégorie hors scolarité). */
export function natureParCategorie(nomCategorie: string | null | undefined): NatureAffectation | null {
  return nomCategorie ? (NATURE_PAR_CATEGORIE[nomCategorie] ?? null) : null;
}
export const estCategorieScolarite = (nom: string | null | undefined) => natureParCategorie(nom) !== null;

/**
 * « Exercice 2026-2027 » → « 2026-2027 ». L'onglet Frais de scolarité raisonne
 * par année scolaire ; un exercice lui correspond exactement.
 */
export function anneeScolaireDe(libelleExercice: string | null): string | null {
  const m = (libelleExercice ?? "").match(/(\d{4})\s*[-–]\s*(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Fléchage d'une opération vers une ou plusieurs familles de l'onglet Frais de
 * scolarité.
 *
 * - Un don d'association (Amitié Sainte Anne notamment) reste comptabilisé en
 *   « Don d'Association » : l'affectation dit quelle part bénéficie à quelle
 *   famille, et compte comme réglé pour elle.
 * - Une écriture de scolarité (mère ou sous-écriture) porte en plus une
 *   NATURE : mensualité (réglé de l'année), mois d'avance (dépôt versé une fois
 *   par enfant) ou frais de dossier (60 € par enfant entrant). Les deux
 *   dernières alimentent les colonnes du même nom. La nature découle de la
 *   catégorie de l'écriture (`categorie`) ; à défaut, elle se choisit.
 */
export default function AffectationScolarite({
  operationId,
  montantOperation,
  inscriptions,
  affectations,
  libelleExercice,
  mode = "don",
  compact = false,
  categorie = null,
}: {
  operationId: string;
  montantOperation: number;
  inscriptions: Inscription[];
  affectations: Affectation[];
  /** Exercice d'affectation de l'opération : il détermine l'année scolaire visée. */
  libelleExercice: string | null;
  /** « don » : don d'association fléché ; « scolarite » : nature à choisir. */
  mode?: "don" | "scolarite";
  /** Présentation resserrée, pour une sous-écriture dans le volet de ventilation. */
  compact?: boolean;
  /** Nom de la catégorie de l'écriture : impose la nature en mode « scolarite ». */
  categorie?: string | null;
}) {
  const router = useRouter();
  const [inscriptionId, setInscriptionId] = useState("");
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState("");
  const natureImposee = mode === "scolarite" ? natureParCategorie(categorie) : null;
  const [natureChoisie, setNature] = useState<NatureAffectation>(mode === "don" ? "don_association" : "mensualite");
  const nature = natureImposee ?? natureChoisie;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mines = useMemo(
    () => affectations.filter((a) => a.operation_id === operationId),
    [affectations, operationId],
  );
  const parInscription = useMemo(
    () => new Map(inscriptions.map((i) => [i.id, i])),
    [inscriptions],
  );

  const affecte = mines.reduce((s, a) => s + Number(a.montant), 0);
  const reste = montantOperation - affecte;

  // L'affectation suit l'exercice de l'opération : seules les familles inscrites
  // cette année-là sont proposées, sinon le report ne tomberait pas dans le bon
  // onglet Frais de scolarité. Un dépôt versé l'été pour la rentrée suivante
  // peut viser l'année d'après : on propose aussi celle-ci.
  const anneeCible = anneeScolaireDe(libelleExercice);
  const anneeSuivante = anneeCible
    ? `${Number(anneeCible.slice(0, 4)) + 1}-${Number(anneeCible.slice(5, 9)) + 1}`
    : null;
  const inscriptionsAnnee = anneeCible
    ? inscriptions.filter(
        (i) => i.annee_scolaire === anneeCible || (mode === "scolarite" && i.annee_scolaire === anneeSuivante),
      )
    : inscriptions;

  const naturesProposees = NATURES.filter((n) =>
    mode === "don" ? n.v === "don_association" : n.v !== "don_association",
  );

  async function ajouter() {
    setError(null);
    const m = Number(montant);
    if (!inscriptionId) return setError("Choisissez une famille.");
    if (!Number.isFinite(m) || m <= 0) return setError("Montant invalide.");
    if (m > reste + 0.005) {
      return setError(`Il ne reste que ${formatEuros(reste)} à affecter sur cette opération.`);
    }

    setBusy(true);
    const { error: err } = await createClient().from("affectations_scolarite").insert({
      operation_id: operationId,
      inscription_id: inscriptionId,
      montant: m,
      nature,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (err) return setError("Enregistrement impossible : " + err.message);

    setInscriptionId("");
    setMontant("");
    setNotes("");
    router.refresh();
  }

  async function retirer(id: string) {
    setError(null);
    setBusy(true);
    const { error: err } = await createClient().from("affectations_scolarite").delete().eq("id", id);
    setBusy(false);
    if (err) return setError("Suppression impossible : " + err.message);
    router.refresh();
  }

  const cadre = compact
    ? "space-y-2 rounded-lg border border-border bg-surface-1/60 p-2"
    : "space-y-3 rounded-lg border border-gold/40 bg-gold-soft/25 p-3";

  return (
    <div className={cadre}>
      {!compact && (
        <div>
          <p className="text-sm font-medium text-gold">
            {mode === "don" ? "Affectation aux frais de scolarité" : "Famille concernée"}
          </p>
          {mode === "don" ? (
            <p className="mt-1 text-xs text-muted">
              L&apos;opération reste comptée en <strong>Don d&apos;Association</strong>. Ce fléchage indique
              quelle part bénéficie à quelle famille, et alimente l&apos;onglet Frais de scolarité. La part
              non affectée demeure un don libre.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Rattachez le montant à une famille en précisant sa nature : <strong>mensualité</strong> (compte
              comme réglé), <strong>mois d&apos;avance</strong> (dépôt versé une fois par enfant) ou{" "}
              <strong>frais de dossier</strong> (60 € par enfant entrant). C&apos;est ce qui alimente les
              colonnes de l&apos;onglet Frais de scolarité.
            </p>
          )}
          {anneeCible ? (
            <p className="mt-1 text-xs text-muted">
              Année scolaire <strong>{anneeCible}</strong> d&apos;après l&apos;exercice de l&apos;opération
              {mode === "scolarite" && anneeSuivante ? ` (ou ${anneeSuivante} pour un dépôt de rentrée)` : ""}.
            </p>
          ) : (
            <p className="mt-1 text-xs text-negative">
              Aucun exercice n&apos;est affecté à cette opération : choisissez-en un ci-dessus pour savoir
              sur quelle année scolaire reporter le fléchage.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-muted">
          Total : <strong className="text-foreground">{formatEuros(montantOperation)}</strong>
        </span>
        <span className="text-muted">
          Affecté : <strong className="text-foreground">{formatEuros(affecte)}</strong>
        </span>
        <span className={reste < 0 ? "text-negative" : "text-muted"}>
          {mode === "don" ? "Reste en don libre : " : "Non rattaché : "}
          <strong className={reste < 0 ? "text-negative" : "text-foreground"}>{formatEuros(reste)}</strong>
        </span>
      </div>

      {mines.length > 0 && (
        <ul className="space-y-1">
          {mines.map((a) => {
            const i = parInscription.get(a.inscription_id);
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-surface px-3 py-1.5 text-sm">
                <span>
                  <strong>{i ? i.famille_nom : "Famille inconnue"}</strong>
                  {i && <span className="ml-2 text-xs text-muted">{i.annee_scolaire}</span>}
                  {a.nature && a.nature !== "don_association" && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      {libelleNature(a.nature)}
                    </span>
                  )}
                  {a.notes && <span className="ml-2 text-xs text-muted">— {a.notes}</span>}
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="tabular-nums font-medium">{formatEuros(Number(a.montant))}</span>
                  <button
                    type="button"
                    onClick={() => retirer(a.id)}
                    disabled={busy}
                    className="text-xs text-muted hover:text-negative"
                    title="Retirer cette affectation"
                  >
                    ✕
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {reste > 0.005 && inscriptionsAnnee.length === 0 && anneeCible && (
        <p className="text-xs text-muted">
          Aucune famille inscrite en {anneeCible} n&apos;est disponible pour cette opération.
        </p>
      )}

      {reste > 0.005 && inscriptionsAnnee.length > 0 && (
        <div
          className={`grid grid-cols-1 gap-2 ${
            mode === "scolarite" ? "sm:grid-cols-[1fr_10rem_7rem_auto]" : "sm:grid-cols-[1fr_8rem_auto]"
          }`}
        >
          <select value={inscriptionId} onChange={(e) => setInscriptionId(e.target.value)} className={inputCls}>
            <option value="">— famille —</option>
            {inscriptionsAnnee.map((i) => (
              <option key={i.id} value={i.id}>
                {i.famille_nom} · {i.annee_scolaire}
                {i.nb_enfants ? ` (${i.nb_enfants} enf.)` : ""}
              </option>
            ))}
          </select>
          {mode === "scolarite" && natureImposee && (
            <div className="flex items-center text-xs text-muted" title="Nature déduite de la catégorie de l'écriture">
              {libelleNature(natureImposee)}
            </div>
          )}
          {mode === "scolarite" && !natureImposee && (
            <select
              value={nature}
              onChange={(e) => setNature(e.target.value as NatureAffectation)}
              className={inputCls}
              title="Nature du montant rattaché"
            >
              {naturesProposees.map((n) => (
                <option key={n.v} value={n.v}>{n.l}</option>
              ))}
            </select>
          )}
          <input
            type="number"
            step="0.01"
            min="0"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className={inputCls}
            placeholder={reste.toFixed(2)}
          />
          <button
            type="button"
            onClick={ajouter}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "don" ? "Affecter" : "Rattacher"}
          </button>
          {!compact && (
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputCls} ${mode === "scolarite" ? "sm:col-span-4" : "sm:col-span-3"}`}
              placeholder="Note (facultatif) — ex. « subvention 2026-2027 »"
            />
          )}
        </div>
      )}

      {reste <= 0.005 && (
        <p className="text-xs text-positive">Montant intégralement {mode === "don" ? "affecté" : "rattaché"}.</p>
      )}

      {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
    </div>
  );
}
