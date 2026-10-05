"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, inputCls } from "@/components/GestionComptes";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { formatDate, formatEuros } from "@/lib/format";
import { normaliser } from "@/lib/reconciliation";
import Icon from "@/components/Icon";

type Operation = {
  id: string;
  date_operation: string;
  montant: number | string;
  libelle: string | null;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
  parent_id: string | null;
  est_ventilee: boolean | null;
};
type Ligne = { id: string; date: string; montant: number; texte: string; fille: boolean; mere: boolean };

const COLONNES = "id, date_operation, montant, libelle, libelle_origine, libelle_origine_chiffre, parent_id, est_ventilee";

/**
 * Montant « Obtenu » d'un prospect : somme des écritures comptables liées (écriture mère ou fille de Comptabilité).
 * Le lien est fait ici par le Trésorier ; une écriture ne peut servir qu'à un seul prospect.
 */
export default function LierEcrituresProspect({ prospectId, prospectNom, onClose }: { prospectId: string; prospectNom: string; onClose: () => void }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [liees, setLiees] = useState<Ligne[]>([]);
  const [libres, setLibres] = useState<Ligne[]>([]);
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const supabase = createClient();
    const [{ data: ops, error }, { data: liens }] = await Promise.all([
      supabase.from("operations").select(COLONNES).eq("type", "recette").order("date_operation", { ascending: false }).range(0, 1999),
      supabase.from("prospects_ecritures").select("operation_id, prospect_id"),
    ]);
    if (error) {
      setErreur("Lecture des écritures impossible : " + error.message);
      return setChargement(false);
    }
    const lies = new Map(((liens ?? []) as { operation_id: string; prospect_id: string }[]).map((l) => [l.operation_id, l.prospect_id]));
    const liste = (ops ?? []) as Operation[];
    const meres = new Set(liste.map((o) => o.parent_id).filter(Boolean) as string[]);
    const lignes: (Ligne & { prospect: string | undefined })[] = [];
    for (const o of liste) {
      const clair = texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre));
      lignes.push({
        id: o.id,
        date: o.date_operation,
        montant: Number(o.montant),
        texte: [clair, o.libelle_origine ?? o.libelle].filter(Boolean).join(" · ") || "—",
        fille: !!o.parent_id,
        mere: !!o.est_ventilee || meres.has(o.id),
        prospect: lies.get(o.id),
      });
    }
    setLiees(lignes.filter((l) => l.prospect === prospectId));
    setLibres(lignes.filter((l) => !l.prospect));
    setChargement(false);
  }, [coffre.dechiffrer, prospectId]);

  useEffect(() => {
    // Lecture initiale (système externe : la base).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const mots = normaliser(recherche).split(" ").filter(Boolean);
  const candidats = useMemo(
    () =>
      libres
        .filter((l) => mots.length === 0 || mots.every((m) => normaliser(`${l.texte} ${formatDate(l.date)} ${String(l.montant).replace(".", ",")}`).includes(m)))
        .slice(0, 40),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libres, recherche],
  );
  const total = liees.reduce((s, l) => s + l.montant, 0);

  async function lier(l: Ligne) {
    setBusy(l.id);
    setErreur(null);
    const { error } = await createClient().from("prospects_ecritures").insert({ prospect_id: prospectId, operation_id: l.id });
    setBusy(null);
    if (error) return setErreur("Lien impossible : " + error.message);
    await charger();
    router.refresh();
  }
  async function delier(l: Ligne) {
    setBusy(l.id);
    setErreur(null);
    const { error } = await createClient().from("prospects_ecritures").delete().eq("operation_id", l.id);
    setBusy(null);
    if (error) return setErreur("Suppression du lien impossible : " + error.message);
    await charger();
    router.refresh();
  }

  const detail = (l: Ligne) => (
    <>
      <span className="tabular-nums text-muted">{formatDate(l.date)}</span>
      <span className="min-w-0 flex-1 truncate" title={l.texte}>
        {l.texte}
        {l.fille && <span className="ml-1 text-[11px] text-muted">(écriture fille)</span>}
        {l.mere && <span className="ml-1 text-[11px] text-muted">(écriture ventilée)</span>}
      </span>
      <span className="font-medium tabular-nums">{formatEuros(l.montant)}</span>
    </>
  );

  return (
    <Modal title={`Écritures liées — ${prospectNom}`} onClose={onClose} fermerAuClicExterieur>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <p className="text-xs text-muted">
          Le montant « Obtenu » est la somme des écritures de Comptabilité liées à ce prospect (écriture mère ou fille). Une écriture ne sert qu&apos;à un prospect.
        </p>
        <section>
          <h3 className="mb-1 font-medium">
            Liées ({liees.length}) <span className="text-xs font-normal text-muted">— total {formatEuros(total)}</span>
          </h3>
          {liees.length === 0 ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Aucune écriture liée.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {liees.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  {detail(l)}
                  <button
                    type="button"
                    onClick={() => void delier(l)}
                    disabled={busy !== null}
                    className="rounded p-1.5 text-muted hover:bg-negative/10 hover:text-negative disabled:opacity-50"
                    title="Délier cette écriture"
                    aria-label="Délier cette écriture"
                  >
                    <Icon name="corbeille" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-1 font-medium">Lier une écriture</h3>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (libellé, date, montant)…"
            className={`${inputCls} mb-2`}
          />
          {chargement ? (
            <p className="text-xs text-muted">Chargement des écritures…</p>
          ) : candidats.length === 0 ? (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Aucune écriture disponible pour cette recherche.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {candidats.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  {detail(l)}
                  <button
                    type="button"
                    onClick={() => void lier(l)}
                    disabled={busy !== null}
                    className="rounded p-1.5 text-accent hover:bg-accent-soft disabled:opacity-50"
                    title="Lier cette écriture au prospect"
                    aria-label="Lier cette écriture au prospect"
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!coffre.estOuvert && <p className="mt-1 text-xs text-muted">Coffre verrouillé : les libellés de dons sont masqués (montants et dates visibles).</p>}
        </section>
        {erreur && <p className="text-xs text-negative">{erreur}</p>}
      </div>
    </Modal>
  );
}
