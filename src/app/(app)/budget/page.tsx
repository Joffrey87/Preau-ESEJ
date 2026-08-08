import PageHeader from "@/components/PageHeader";
import EditionBudget from "@/components/EditionBudget";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";

type BudgetLigne = {
  id: string;
  montant_prevu: number;
  categorie_id: string;
  categories: { nom: string; type: "recette" | "depense" } | null;
};

type Categorie = { id: string; nom: string; type: "recette" | "depense" };

type OpAgg = { categorie_id: string | null; montant: number; type: "recette" | "depense" };

export default async function BudgetPage() {
  const supabase = await createClient();

  const { data: exercice } = await supabase
    .from("exercices")
    .select("id, libelle")
    .eq("actif", true)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [budgetRes, opsRes, catsRes] = await Promise.all([
    exercice
      ? supabase
          .from("budget_lignes")
          .select("id, montant_prevu, categorie_id, categories(nom, type)")
          .eq("exercice_id", exercice.id)
      : Promise.resolve({ data: [] as BudgetLigne[] }),
    exercice
      ? supabase
          .from("operations")
          .select("categorie_id, montant, type")
          .eq("exercice_id", exercice.id)
      : Promise.resolve({ data: [] as OpAgg[] }),
    supabase
      .from("categories")
      .select("id, nom, type")
      .eq("archive", false)
      .order("type")
      .order("ordre")
      .order("nom"),
  ]);

  const lignes = (budgetRes.data ?? []) as unknown as BudgetLigne[];
  const ops = (opsRes.data ?? []) as OpAgg[];
  const categories = (catsRes.data ?? []) as Categorie[];

  // Montant prévu déjà enregistré, par catégorie (pour pré-remplir l'éditeur).
  const existant: Record<string, number> = {};
  for (const l of lignes) existant[l.categorie_id] = Number(l.montant_prevu);

  // Réalisé par catégorie
  const realiseParCat = new Map<string, number>();
  for (const op of ops) {
    if (!op.categorie_id) continue;
    realiseParCat.set(
      op.categorie_id,
      (realiseParCat.get(op.categorie_id) ?? 0) + Number(op.montant),
    );
  }

  const recettes = lignes.filter((l) => l.categories?.type === "recette");
  const depenses = lignes.filter((l) => l.categories?.type === "depense");

  const renderRows = (rows: BudgetLigne[]) =>
    rows.map((l) => {
      const prevu = Number(l.montant_prevu);
      const realise = realiseParCat.get(l.categorie_id) ?? 0;
      const ecart = prevu - realise;
      const pct = prevu > 0 ? Math.round((realise / prevu) * 100) : null;
      return (
        <tr key={l.id} className="border-b border-border last:border-0">
          <td className="px-4 py-3">{l.categories?.nom ?? "—"}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatEuros(prevu)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatEuros(realise)}</td>
          <td
            className={`px-4 py-3 text-right tabular-nums ${
              ecart < 0 ? "text-negative" : "text-muted"
            }`}
          >
            {formatEuros(ecart)}
          </td>
          <td className="px-4 py-3 text-right tabular-nums text-muted">
            {pct === null ? "—" : `${pct} %`}
          </td>
        </tr>
      );
    });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Budget"
        subtitle={
          exercice
            ? `Prévisionnel et réalisé · ${exercice.libelle}`
            : "Budget prévisionnel et suivi du réalisé par poste."
        }
        action={
          exercice ? (
            <EditionBudget
              categories={categories}
              exerciceId={exercice.id}
              existant={existant}
            />
          ) : undefined
        }
      />

      {lignes.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center text-muted">
          Aucun poste budgétaire défini pour cet exercice.
          <br />
          <span className="text-sm">
            Cliquez sur « Modifier le budget » pour saisir le prévisionnel.
          </span>
        </div>
      ) : (
        <div className="space-y-8">
          {[
            { title: "Recettes", rows: recettes },
            { title: "Dépenses", rows: depenses },
          ].map((grp) => {
            const totalPrevu = grp.rows.reduce((s, l) => s + Number(l.montant_prevu), 0);
            const totalRealise = grp.rows.reduce(
              (s, l) => s + (realiseParCat.get(l.categorie_id) ?? 0),
              0,
            );
            const totalEcart = totalPrevu - totalRealise;
            const totalPct =
              totalPrevu > 0 ? Math.round((totalRealise / totalPrevu) * 100) : null;
            return (
              <div key={grp.title}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                  {grp.title}
                </h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="px-4 py-3 font-medium">Poste</th>
                        <th className="px-4 py-3 font-medium text-right">Prévu</th>
                        <th className="px-4 py-3 font-medium text-right">Réalisé</th>
                        <th className="px-4 py-3 font-medium text-right">Écart</th>
                        <th className="px-4 py-3 font-medium text-right">Consommé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grp.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted">
                            Aucun poste.
                          </td>
                        </tr>
                      ) : (
                        renderRows(grp.rows)
                      )}
                    </tbody>
                    {grp.rows.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatEuros(totalPrevu)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatEuros(totalRealise)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              totalEcart < 0 ? "text-negative" : "text-muted"
                            }`}
                          >
                            {formatEuros(totalEcart)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">
                            {totalPct === null ? "—" : `${totalPct} %`}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
