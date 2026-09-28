"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate } from "@/lib/format";

export type ImportPasse = {
  id: string;
  fichier: string | null;
  compte_id: string | null;
  nb_operations: number;
  total_recettes: number;
  total_depenses: number;
  solde_banque: number | null;
  solde_date: string | null;
  solde_preau: number | null;
  cree_le: string;
  annule_le: string | null;
};

type Bilan = { operations: number; sousEcritures: number; dons: number; donsRelies: number; modifications: number };

/**
 * Derniers imports de relevés, avec annulation.
 *
 * Annuler supprime les opérations du lot (sous-écritures et rattachements aux
 * familles suivent par cascade) et les dons que l'import a créés. Un don déjà
 * saisi qui avait seulement été relié redevient libre. Le lot reste listé,
 * marqué « annulé », pour la traçabilité.
 */
export default function ImportsPasses({
  imports,
  comptes,
}: {
  imports: ImportPasse[];
  comptes: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [cible, setCible] = useState<{ imp: ImportPasse; bilan: Bilan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (imports.length === 0) return null;
  const nomCompte = (id: string | null) => comptes.find((c) => c.id === id)?.nom ?? "—";
  const dateHeure = (iso: string) =>
    new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

  /** Mesure ce que l'annulation va défaire, avant de demander confirmation. */
  async function preparer(imp: ImportPasse) {
    setErreur(null);
    setBusy(true);
    const supabase = createClient();
    const { data: ops } = await supabase.from("operations").select("id, parent_id").eq("import_id", imp.id);
    const ids = (ops ?? []).map((o) => o.id as string);
    const [{ count: dons }, { count: donsRelies }, { count: modifications }] = await Promise.all([
      supabase.from("dons").select("id", { count: "exact", head: true }).eq("import_id", imp.id),
      ids.length
        ? supabase.from("dons").select("id", { count: "exact", head: true }).in("operation_id", ids).is("import_id", null)
        : Promise.resolve({ count: 0 }),
      ids.length
        ? supabase
            .from("journal_operations")
            .select("id", { count: "exact", head: true })
            .in("operation_id", ids)
            .gt("fait_le", imp.cree_le)
        : Promise.resolve({ count: 0 }),
    ]);
    setBusy(false);
    setCible({
      imp,
      bilan: {
        operations: (ops ?? []).filter((o) => !o.parent_id).length,
        sousEcritures: (ops ?? []).filter((o) => o.parent_id).length,
        dons: dons ?? 0,
        donsRelies: donsRelies ?? 0,
        modifications: modifications ?? 0,
      },
    });
  }

  async function annuler() {
    if (!cible) return;
    setBusy(true);
    setErreur(null);
    const supabase = createClient();
    const id = cible.imp.id;
    // Les dons créés par l'import d'abord ; puis les opérations (les
    // sous-écritures et les rattachements aux familles suivent par cascade,
    // les dons simplement reliés sont déliés par la contrainte).
    let err = (await supabase.from("dons").delete().eq("import_id", id)).error;
    if (!err) err = (await supabase.from("operations").delete().eq("import_id", id).is("parent_id", null)).error;
    if (!err) err = (await supabase.from("operations").delete().eq("import_id", id)).error;
    if (!err) {
      const { data: auth } = await supabase.auth.getUser();
      err = (
        await supabase
          .from("imports_releve")
          .update({ annule_le: new Date().toISOString(), annule_par: auth.user?.id ?? null })
          .eq("id", id)
      ).error;
    }
    setBusy(false);
    if (err) return setErreur("Annulation impossible : " + err.message);
    setCible(null);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold"
      >
        <span>Derniers imports ({imports.length})</span>
        <span className={`text-muted transition-transform ${ouvert ? "rotate-90" : ""}`}>›</span>
      </button>
      {ouvert && (
        <div className="border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Importé le</th>
                <th className="px-4 py-2 font-medium">Fichier</th>
                <th className="px-4 py-2 font-medium">Compte</th>
                <th className="px-4 py-2 text-right font-medium">Opérations</th>
                <th className="px-4 py-2 text-right font-medium">Solde (banque / Préau)</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const ecart =
                  imp.solde_banque != null && imp.solde_preau != null
                    ? Math.round((Number(imp.solde_banque) - Number(imp.solde_preau)) * 100) / 100
                    : null;
                return (
                  <tr key={imp.id} className={`border-b border-border last:border-0 ${imp.annule_le ? "text-muted line-through" : ""}`}>
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">{dateHeure(imp.cree_le)}</td>
                    <td className="max-w-[16rem] truncate px-4 py-2" title={imp.fichier ?? undefined}>{imp.fichier ?? "—"}</td>
                    <td className="px-4 py-2">{nomCompte(imp.compte_id)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {imp.nb_operations}
                      <span className="ml-2 text-xs text-positive">+{formatEuros(Number(imp.total_recettes))}</span>
                      <span className="ml-1 text-xs text-negative">−{formatEuros(Number(imp.total_depenses))}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums whitespace-nowrap">
                      {imp.solde_banque != null ? (
                        <>
                          {imp.solde_date ? `${formatDate(imp.solde_date)} · ` : ""}
                          {formatEuros(Number(imp.solde_banque))} / {formatEuros(Number(imp.solde_preau ?? 0))}
                          {ecart !== null && Math.abs(ecart) >= 0.01 && (
                            <span className="ml-1 font-medium text-gold">(écart {formatEuros(ecart)})</span>
                          )}
                          {ecart !== null && Math.abs(ecart) < 0.01 && <span className="ml-1 text-positive">✓</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {imp.annule_le ? (
                        <span className="text-xs no-underline">annulé le {dateHeure(imp.annule_le)}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => preparer(imp)}
                          disabled={busy}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:border-negative hover:text-negative disabled:opacity-50"
                        >
                          Annuler l&apos;import
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cible && (
        <div className="border-t border-negative/30 bg-negative/5 px-5 py-4 text-sm">
          <p className="font-semibold text-negative">
            Annuler l&apos;import du {dateHeure(cible.imp.cree_le)} ({cible.imp.fichier ?? "fichier sans nom"}) ?
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            <li>
              {cible.bilan.operations} opération(s) supprimée(s)
              {cible.bilan.sousEcritures > 0 && `, avec ${cible.bilan.sousEcritures} sous-écriture(s)`}, ainsi que leurs
              rattachements à l&apos;onglet Frais de scolarité ;
            </li>
            <li>{cible.bilan.dons} don(s) créé(s) par l&apos;import supprimé(s) ;</li>
            {cible.bilan.donsRelies > 0 && (
              <li>{cible.bilan.donsRelies} don(s) déjà saisi(s) auparavant seront simplement déliés (conservés) ;</li>
            )}
            {cible.bilan.modifications > 0 && (
              <li className="font-medium text-negative">
                {cible.bilan.modifications} modification(s) faite(s) depuis sur ces opérations seront perdues.
              </li>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={annuler}
              disabled={busy}
              className="rounded-lg bg-negative px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Annulation…" : "Confirmer l'annulation"}
            </button>
            <button
              type="button"
              onClick={() => setCible(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              Garder l&apos;import
            </button>
          </div>
          {erreur && <p className="mt-2 text-xs text-negative">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
