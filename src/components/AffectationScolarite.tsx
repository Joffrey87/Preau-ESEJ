"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";
import { formatEuros } from "@/lib/format";

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
};

/**
 * « Exercice 2026-2027 » → « 2026-2027 ». L'onglet Frais de scolarité raisonne
 * par année scolaire ; un exercice lui correspond exactement.
 */
export function anneeScolaireDe(libelleExercice: string | null): string | null {
  const m = (libelleExercice ?? "").match(/(\d{4})\s*[-–]\s*(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Fléchage d'un don d'association (Amitié Sainte Anne notamment) vers les frais
 * de scolarité d'une ou plusieurs familles.
 *
 * L'opération reste comptabilisée en « Don d'Association » : l'affectation est
 * une information portée par l'opération, pas une écriture comptable. La part
 * non affectée demeure un don pur et simple.
 */
export default function AffectationScolarite({
  operationId,
  montantOperation,
  inscriptions,
  affectations,
  libelleExercice,
}: {
  operationId: string;
  montantOperation: number;
  inscriptions: Inscription[];
  affectations: Affectation[];
  /** Exercice d'affectation de l'opération : il détermine l'année scolaire visée. */
  libelleExercice: string | null;
}) {
  const router = useRouter();
  const [inscriptionId, setInscriptionId] = useState("");
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState("");
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
  // onglet Frais de scolarité.
  const anneeCible = anneeScolaireDe(libelleExercice);
  const inscriptionsAnnee = anneeCible
    ? inscriptions.filter((i) => i.annee_scolaire === anneeCible)
    : inscriptions;

  // Une famille déjà affectée sur cette opération ne peut pas l'être deux fois.
  const disponibles = inscriptionsAnnee.filter((i) => !mines.some((a) => a.inscription_id === i.id));

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

  return (
    <div className="space-y-3 rounded-lg border border-gold/40 bg-gold-soft/25 p-3">
      <div>
        <p className="text-sm font-medium text-gold">Affectation aux frais de scolarité</p>
        <p className="mt-1 text-xs text-muted">
          L&apos;opération reste comptée en <strong>Don d&apos;Association</strong>. Ce fléchage indique
          quelle part bénéficie à quelle famille, et alimente l&apos;onglet Frais de scolarité. La part
          non affectée demeure un don libre.
        </p>
        {anneeCible ? (
          <p className="mt-1 text-xs text-muted">
            Reporté sur l&apos;année scolaire <strong>{anneeCible}</strong>, d&apos;après l&apos;exercice
            d&apos;affectation de l&apos;opération.
          </p>
        ) : (
          <p className="mt-1 text-xs text-negative">
            Aucun exercice n&apos;est affecté à cette opération : choisissez-en un ci-dessus pour savoir
            sur quelle année scolaire reporter le fléchage.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-muted">
          Total : <strong className="text-foreground">{formatEuros(montantOperation)}</strong>
        </span>
        <span className="text-muted">
          Affecté : <strong className="text-foreground">{formatEuros(affecte)}</strong>
        </span>
        <span className={reste < 0 ? "text-negative" : "text-muted"}>
          Reste en don libre : <strong className={reste < 0 ? "text-negative" : "text-foreground"}>{formatEuros(reste)}</strong>
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

      {reste > 0.005 && disponibles.length === 0 && anneeCible && (
        <p className="text-xs text-muted">
          Aucune famille inscrite en {anneeCible} n&apos;est encore disponible pour cette opération.
        </p>
      )}

      {reste > 0.005 && disponibles.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <select value={inscriptionId} onChange={(e) => setInscriptionId(e.target.value)} className={inputCls}>
            <option value="">— famille —</option>
            {disponibles.map((i) => (
              <option key={i.id} value={i.id}>
                {i.famille_nom} · {i.annee_scolaire}
                {i.nb_enfants ? ` (${i.nb_enfants} enf.)` : ""}
              </option>
            ))}
          </select>
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
            {busy ? "…" : "Affecter"}
          </button>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputCls} sm:col-span-3`}
            placeholder="Note (facultatif) — ex. « subvention 2026-2027 »"
          />
        </div>
      )}

      {reste <= 0.005 && (
        <p className="text-xs text-positive">Montant intégralement affecté.</p>
      )}

      {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
    </div>
  );
}
