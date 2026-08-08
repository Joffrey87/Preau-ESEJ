import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";
import { MOIS_FR } from "@/lib/bilan";
import {
  CIBLES,
  margeVentes,
  partDons,
  num,
  type MecenatStats,
  type ExerciceStat,
} from "@/lib/mecenat";

const MOIS_COURT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
// Pics de dons repérés dans le plan V3 : avril, juillet, octobre, décembre.
const PICS = new Set([4, 7, 10, 12]);

export default async function MecenatPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mecenat_stats");
  const stats = (data as MecenatStats | null) ?? { exercices: [], saisonnalite: [] };

  const exercices = stats.exercices;
  const courant = exercices[exercices.length - 1] as ExerciceStat | undefined;

  const collecte = courant ? num(courant.dons) : 0;
  const part = courant ? partDons(courant) : 0;
  const marge = courant ? margeVentes(courant) : 0;
  const resultat = courant ? num(courant.total_recettes) - num(courant.total_depenses) : 0;

  const maxDonsEx = Math.max(1, ...exercices.map((e) => num(e.dons)));
  const maxSaison = Math.max(1, ...stats.saisonnalite.map((s) => num(s.dons)));

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Mécénat — pilotage de la collecte"
        subtitle="Cibles du plan de financement confrontées au réalisé (données réelles de la comptabilité)."
      />

      {!courant ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center text-muted">
          Aucune donnée de collecte.
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs vs cibles — exercice courant */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Collecte de dons"
              valeur={formatEuros(collecte)}
              cible={`cible ≥ ${formatEuros(CIBLES.collecteDons)}`}
              ok={collecte >= CIBLES.collecteDons}
            />
            <Kpi
              label="Dépendance aux dons"
              valeur={`${Math.round(part)} %`}
              cible={`cible ≤ ${CIBLES.partDonsMax} %`}
              ok={part <= CIBLES.partDonsMax}
              sens="bas"
            />
            <Kpi
              label="Marge nette ventes"
              valeur={formatEuros(marge)}
              cible={`cible ≥ ${formatEuros(CIBLES.margeVentes)}`}
              ok={marge >= CIBLES.margeVentes}
            />
            <Kpi
              label="Résultat de l'exercice"
              valeur={formatEuros(resultat)}
              cible={courant.libelle.replace("Exercice ", "")}
              ok={resultat >= 0}
            />
          </div>

          {/* Collecte de dons par exercice */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Collecte de dons par exercice</h2>
            <div className="mt-4 space-y-3">
              {exercices.map((e) => {
                const v = num(e.dons);
                return (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted">{e.libelle.replace("Exercice ", "")}</span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-2">
                      <div
                        className="h-full rounded bg-gold"
                        style={{ width: `${(v / maxDonsEx) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatEuros(v)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Saisonnalité — les 4 pics */}
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Saisonnalité des dons (tous exercices cumulés)</h2>
              <span className="text-xs text-muted">Pics repérés : avr. · juil. · oct. · déc.</span>
            </div>
            <div className="mt-5 flex items-end gap-1.5" style={{ height: 140 }}>
              {Array.from({ length: 12 }, (_, i) => {
                const s = stats.saisonnalite.find((x) => x.mois === i + 1);
                const v = s ? num(s.dons) : 0;
                const pic = PICS.has(i + 1);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${MOIS_FR[i]} : ${formatEuros(v)}`}>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t ${pic ? "bg-gold" : "bg-accent/40"}`}
                        style={{ height: `${Math.max(2, (v / maxSaison) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] ${pic ? "font-semibold text-gold" : "text-muted"}`}>{MOIS_COURT[i]}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Ventes au profit de l'école — pilier C */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Ventes au profit de l&apos;école (pilier C)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-5 py-2 font-medium">Exercice</th>
                  <th className="px-5 py-2 text-right font-medium">Brut</th>
                  <th className="px-5 py-2 text-right font-medium">Fournitures</th>
                  <th className="px-5 py-2 text-right font-medium">Marge nette</th>
                </tr>
              </thead>
              <tbody>
                {exercices.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{e.libelle.replace("Exercice ", "")}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{formatEuros(num(e.ventes_brut))}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">−{formatEuros(num(e.ventes_fournitures))}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums text-positive">{formatEuros(margeVentes(e))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Indicateurs donateurs — à compléter */}
          <section className="rounded-xl border border-dashed border-border bg-surface-2 px-5 py-4 text-sm">
            <p className="font-medium">Indicateurs par donateur (concentration, rétention, donateurs actifs)</p>
            <p className="mt-1 text-muted">
              Ces indicateurs — part des 5 premiers donateurs (cible &lt; {CIBLES.partTop5Max} %), taux de rétention,
              nombre de donateurs actifs — nécessitent la base de dons détaillée. En attendant, suivez vos prospects
              dans le <a href="/mecenat/pipeline" className="text-accent hover:underline">pipeline grands donateurs</a>.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  valeur,
  cible,
  ok,
  sens = "haut",
}: {
  label: string;
  valeur: string;
  cible: string;
  ok: boolean;
  sens?: "haut" | "bas";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{valeur}</div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${ok ? "text-positive" : "text-gold"}`}>
        <span>{ok ? "✓" : sens === "bas" ? "↓" : "↑"}</span>
        <span>{cible}</span>
      </div>
    </div>
  );
}
