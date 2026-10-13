"use client";

import { useMemo, useState } from "react";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { nomDonateur, telechargerRemerciements, type DonRemerciement } from "@/lib/remerciements";

export type DonARemercier = DonRemerciement & { pii_chiffre: string | null; courriel: string | null; remerciement_envoye_le: string | null };

// Période : toutes, un exercice (« exo:2026-2027 », 1er septembre → 31 août) ou une année civile (« civ:2026 »), comme Dons.
type Periode = "toutes" | `exo:${string}` | `civ:${string}`;
const exerciceDe = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};
const dansPeriode = (d: { date_don: string }, p: Periode) =>
  p === "toutes" || (p.startsWith("civ:") ? d.date_don.slice(0, 4) === p.slice(4) : exerciceDe(d.date_don) === p.slice(4));
type Etat = "a_remercier" | "remercies" | "tous";

/** Onglet Remerciements : dons de 500 € et plus, lettre du Président en PDF, « Remerciement envoyé » daté. */
export default function Remerciements({ donsInit }: { donsInit: DonARemercier[] }) {
  const coffre = useCoffre();
  const { dons, verrou } = useDonsDechiffres(donsInit);
  const [envois, setEnvois] = useState<Record<string, string | null>>(() => Object.fromEntries(donsInit.map((d) => [d.id, d.remerciement_envoye_le])));
  const [periode, setPeriode] = useState<Periode>(`exo:${exerciceDe(new Date().toISOString().slice(0, 10))}`);
  const [menu, setMenu] = useState(false);
  const [etat, setEtat] = useState<Etat>("a_remercier");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  const periodes = useMemo(() => {
    const dates = donsInit.map((d) => d.date_don).sort();
    const debut = Number((dates[0] ?? new Date().toISOString()).slice(0, 4));
    const fin = new Date().getFullYear();
    const annees: number[] = [];
    for (let y = fin; y >= debut; y--) annees.push(y);
    const exercices: string[] = [];
    for (let y = Number(exerciceDe(new Date().toISOString().slice(0, 10)).slice(0, 4)); y >= debut - 1; y--) exercices.push(`${y}-${y + 1}`);
    return { annees, exercices };
  }, [donsInit]);

  const dePeriode = dons.filter((d) => dansPeriode(d, periode));
  const liste = dePeriode.filter((d) => (etat === "tous" ? true : etat === "remercies" ? !!envois[d.id] : !envois[d.id]));
  // Un même donateur peut avoir plusieurs dons de 500 € et plus sur la période : on le signale.
  const parDonateur = new Map<string, number>();
  for (const d of dePeriode) parDonateur.set(nomDonateur(d), (parDonateur.get(nomDonateur(d)) ?? 0) + 1);
  const aRemercier = dePeriode.filter((d) => !envois[d.id]);
  const libelle = periode === "toutes" ? "Toutes les périodes" : periode.startsWith("civ:") ? `Année ${periode.slice(4)}` : `Exercice ${periode.slice(4)}`;

  async function lettres(liste: DonARemercier[], cle: string) {
    setMessage(null);
    setBusy(cle);
    try {
      await telechargerRemerciements(liste);
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Génération du PDF impossible." });
    } finally {
      setBusy(null);
    }
  }

  async function marquer(d: DonARemercier, envoye: boolean) {
    setMessage(null);
    setBusy(d.id);
    const { data, error } = await createClient().rpc("marquer_remerciement", { p_don: d.id, p_envoye: envoye });
    setBusy(null);
    if (error) return setMessage({ ok: false, t: error.message });
    setEnvois((e) => ({ ...e, [d.id]: (data as string | null) ?? null }));
  }

  if (coffre.charge && !coffre.estConfigure) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">L&apos;accès aux données des donateurs n&apos;est pas encore ouvert pour ce profil : demandez au Trésorier de générer votre code.</p>;
  }
  if (verrou) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-sm">
        <p className="text-gold">🔒 Saisissez votre code pour afficher les noms et les adresses des donateurs.</p>
        <div className="mt-3">
          <DeverrouillerCoffre label="🔓 Saisir mon code" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            {libelle} ▾
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setPeriode("toutes");
                    setMenu(false);
                  }}
                  className={`mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${periode === "toutes" ? "font-medium text-accent" : ""}`}
                >
                  Toutes les périodes
                </button>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-1">
                  {(
                    [
                      ["Année", periodes.annees.map((y) => [`civ:${y}`, String(y)] as const)],
                      ["Exercice", periodes.exercices.map((e) => [`exo:${e}`, e] as const)],
                    ] as const
                  ).map(([titre, options]) => (
                    <div key={titre}>
                      <p className="px-2 py-1 text-xs font-medium text-muted">{titre}</p>
                      <div className="max-h-64 overflow-y-auto">
                        {options.map(([v, l]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setPeriode(v as Periode);
                              setMenu(false);
                            }}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-surface-2 ${periode === v ? "bg-accent-soft font-medium text-accent" : ""}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-[13px]">
          {(
            [
              ["a_remercier", `À remercier (${aRemercier.length})`],
              ["remercies", `Remerciés (${dePeriode.length - aRemercier.length})`],
              ["tous", `Tous (${dePeriode.length})`],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setEtat(v)}
              className={`rounded-md px-3 py-1 font-medium ${etat === v ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {aRemercier.length > 1 && (
          <button
            type="button"
            onClick={() => void lettres(aRemercier, "tout")}
            disabled={busy !== null}
            className="ml-auto rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            title="Un seul PDF : une lettre par don à remercier sur la période"
          >
            {busy === "tout" ? "…" : `📄 Toutes les lettres à envoyer (${aRemercier.length})`}
          </button>
        )}
      </div>

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>}

      {liste.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-10 text-center text-sm text-muted">
          {etat === "a_remercier" ? "Tous les dons de la période ont été remerciés." : "Aucun don sur cette période."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Donateur</th>
                <th className="px-2 py-2 text-right font-medium">Montant</th>
                <th className="px-2 py-2 font-medium">Lettre</th>
                <th className="px-4 py-2 font-medium">Remerciement envoyé</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((d) => {
                const envoyeLe = envois[d.id];
                const plusieurs = parDonateur.get(nomDonateur(d)) ?? 1;
                return (
                  <tr key={d.id} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDate(d.date_don)}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{nomDonateur(d)}</div>
                      <div className="text-[12px] text-muted">{[d.adresse, d.cp_ville].filter(Boolean).join(" · ") || "Adresse manquante"}</div>
                      {plusieurs > 1 && <div className="text-[11px] text-gold">{plusieurs} dons de 500 € et plus sur la période</div>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums">{formatEuros(Number(d.montant))}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void lettres([d], d.id + ":pdf")}
                        disabled={busy !== null}
                        className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-[13px] hover:bg-surface-2 disabled:opacity-50"
                      >
                        {busy === d.id + ":pdf" ? "…" : "📄 PDF"}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <label className="flex items-center gap-2 whitespace-nowrap text-[13px]">
                        <input type="checkbox" checked={!!envoyeLe} disabled={busy !== null} onChange={(e) => void marquer(d, e.target.checked)} />
                        {envoyeLe ? <span className="text-positive">le {formatDate(envoyeLe)}</span> : <span className="text-muted">Non</span>}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
