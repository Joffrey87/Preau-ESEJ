"use client";

import { useState } from "react";
import { Modal } from "./GestionComptes";
import type { DonRow, Groupe } from "./ListeRecus";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { genererRecuPdf, type DonPourRecu } from "@/lib/recu";
import { syntheseVersements } from "@/lib/recuVersements";

const nomAffiche = (d: DonRow) =>
  d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? "—"
    : [d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ") || d.donateur_titre || "—";

/** Données du PDF pour un reçu et les dons qu'il couvre. */
export function donPourRecu(r: DonRow, dons: DonRow[], numero: string, dateEdition: string): DonPourRecu {
  return {
    recu_numero: numero,
    donateur_titre: r.donateur_titre,
    donateur_nom: r.donateur_nom ?? "",
    donateur_prenom: r.donateur_prenom,
    raison_sociale: r.raison_sociale,
    est_personne_morale: r.est_personne_morale,
    adresse: r.adresse,
    cp_ville: r.cp_ville,
    montant: dons.reduce((s, d) => s + Number(d.montant), 0),
    date_don: dons[dons.length - 1].date_don,
    mode_paiement: r.mode_paiement,
    versements: dons.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })),
    envoi_prefere: r.envoi_prefere,
    date_edition: dateEdition,
  };
}

/**
 * Établissement d'un reçu : les dons de l'année encore sans reçu de ce
 * donateur, cochés par défaut. En décocher permet un reçu partiel (un reçu par
 * don, ou un reçu intermédiaire) ; les dons laissés iront sur le reçu suivant.
 * Le numéro est attribué par la base, au moment de valider.
 */
export default function EtablirRecu({
  groupe,
  manquants,
  onFermer,
  onFait,
}: {
  groupe: Groupe;
  manquants: string[];
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [coches, setCoches] = useState<Set<string>>(new Set(groupe.dons.map((d) => d.id)));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const retenus = groupe.dons.filter((d) => coches.has(d.id));
  const total = retenus.reduce((s, d) => s + Number(d.montant), 0);
  const lignes = syntheseVersements(retenus.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })));
  const partiel = retenus.length < groupe.dons.length;

  async function valider() {
    if (retenus.length === 0) return setErreur("Cochez au moins un don.");
    setErreur(null);
    setBusy(true);
    const date = todayISO();
    const { data, error } = await createClient().rpc("etablir_recu", {
      p_dons: retenus.map((d) => d.id),
      p_date: date,
    });
    if (error || !data) {
      setBusy(false);
      return setErreur("Établissement impossible : " + (error?.message ?? "réponse vide"));
    }
    const numero = data as string;
    try {
      // Téléchargement direct : le fichier garde son nom complet (un onglet de visualisation le renommerait).
      await genererRecuPdf(donPourRecu(groupe.representant, retenus, numero, date), { ouvrir: false });
      await createClient().from("recus").update({ telecharge_le: new Date().toISOString() }).eq("recu_numero", numero);
    } catch (e) {
      setBusy(false);
      return onFait(`Reçu ${numero} établi, mais le PDF n'a pas pu être généré (${e instanceof Error ? e.message : "erreur"}) : utilisez « PDF » dans la liste.`);
    }
    setBusy(false);
    onFait(`Reçu ${numero} établi (${formatEuros(total)}) et téléchargé.`);
  }

  return (
    <Modal title={`Établir le reçu ${groupe.annee} — ${nomAffiche(groupe.representant)}`} onClose={onFermer}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Dons {groupe.annee} de ce donateur sans reçu. Décochez-en pour un reçu partiel : ils resteront pour le reçu suivant.
        </p>

        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {groupe.dons.map((d) => (
            <li key={d.id}>
              <label className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-surface-2">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coches.has(d.id)}
                    onChange={(e) =>
                      setCoches((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="tabular-nums">{formatDate(d.date_don)}</span>
                  <span className="text-muted">{d.mode_paiement ?? ""}</span>
                </span>
                <span className="tabular-nums">{formatEuros(Number(d.montant))}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tel qu&apos;imprimé sur le reçu</div>
          {lignes.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 text-xs">
              <span>{l.libelle}</span>
              <span className="tabular-nums">{formatEuros(l.montant)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(total)}</span>
          </div>
        </div>

        {partiel && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Reçu partiel : {groupe.dons.length - retenus.length} don(s) resteront à inclure dans un prochain reçu.
          </p>
        )}
        {manquants.length > 0 && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Fiche incomplète ({manquants.join(", ")}) : complétez-la dans l&apos;onglet Dons avant d&apos;envoyer le reçu.
          </p>
        )}
        <p className="text-xs text-muted">
          Le numéro suivant sera attribué automatiquement (format RE_000NNN_AAAAMMJJ, date du premier don) et le PDF téléchargé.
        </p>
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={busy || retenus.length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Établissement…" : `Établir le reçu (${formatEuros(total)})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

