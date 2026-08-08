import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NouvelleOperation from "@/components/NouvelleOperation";
import DetailsOperation from "@/components/DetailsOperation";
import { createClient } from "@/lib/supabase/server";
import { formatEuros, formatDate } from "@/lib/format";

type OperationRow = {
  id: string;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categories: { nom: string } | null;
  comptes: { nom: string } | null;
};

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ exercice?: string }>;
}) {
  const supabase = await createClient();
  const { exercice: exParam } = await searchParams;

  // Tous les exercices (pour le sélecteur d'année) ; défaut = actif, sinon le plus récent.
  const { data: exercices } = await supabase
    .from("exercices")
    .select("id, libelle, actif")
    .order("date_debut", { ascending: false });
  const liste = exercices ?? [];
  const exercice =
    (exParam && liste.find((e) => e.id === exParam)) ||
    liste.find((e) => e.actif) ||
    liste[0] ||
    null;

  const [opsRes, catsRes, comptesRes] = await Promise.all([
    exercice
      ? supabase
          .from("operations")
          .select(
            "id, date_operation, libelle, libelle_origine, montant, type, mode_paiement, categories(nom), comptes(nom)",
          )
          .eq("exercice_id", exercice.id)
          .order("date_operation", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as OperationRow[] }),
    supabase
      .from("categories")
      .select("id, nom, type")
      .eq("archive", false)
      .order("ordre"),
    supabase.from("comptes").select("id, nom").eq("archive", false).order("ordre"),
  ]);

  const operations = (opsRes.data ?? []) as unknown as OperationRow[];
  const recettes = operations.filter((o) => o.type === "recette").reduce((s, o) => s + Number(o.montant), 0);
  const depenses = operations.filter((o) => o.type === "depense").reduce((s, o) => s + Number(o.montant), 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Comptabilité"
        subtitle={
          exercice
            ? `Recettes et dépenses · ${exercice.libelle}`
            : "Recettes et dépenses de l'exercice."
        }
        action={
          exercice ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/comptabilite/bilan?periode=mois"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Bilan mensuel
              </Link>
              <Link
                href="/comptabilite/import"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Importer relevé
              </Link>
              <NouvelleOperation
                categories={catsRes.data ?? []}
                comptes={comptesRes.data ?? []}
                exerciceId={exercice.id}
              />
            </div>
          ) : null
        }
      />

      {liste.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Exercice :</span>
          {liste.map((e) => (
            <Link
              key={e.id}
              href={`/comptabilite?exercice=${e.id}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                e.id === exercice?.id
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-border hover:bg-surface-2"
              }`}
            >
              {e.libelle.replace("Exercice ", "")}
              {e.actif ? " •" : ""}
            </Link>
          ))}
        </div>
      )}

      {exercice && operations.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="text-xs text-muted">Recettes · {operations.length} opérations</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-positive">{formatEuros(recettes)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="text-xs text-muted">Dépenses</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-negative">{formatEuros(depenses)}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="text-xs text-muted">Résultat</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${recettes - depenses >= 0 ? "text-positive" : "text-negative"}`}>
              {formatEuros(recettes - depenses)}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Libellé</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {operations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted">
                  Aucune opération pour l&apos;instant.
                  <br />
                  <span className="text-sm">
                    Cliquez sur « Nouvelle opération » pour commencer la saisie.
                  </span>
                </td>
              </tr>
            ) : (
              operations.map((op) => (
                <tr key={op.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {formatDate(op.date_operation)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center">
                      {op.libelle}
                      <DetailsOperation
                        op={{
                          libelle: op.libelle,
                          libelle_origine: op.libelle_origine,
                          date_operation: op.date_operation,
                          montant: Number(op.montant),
                          type: op.type,
                          categorie: op.categories?.nom ?? null,
                          mode_paiement: op.mode_paiement,
                          compte: op.comptes?.nom ?? null,
                        }}
                      />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{op.categories?.nom ?? "—"}</td>
                  <td className="px-4 py-3 text-muted capitalize">
                    {op.mode_paiement ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium ${
                      op.type === "recette" ? "text-positive" : "text-negative"
                    }`}
                  >
                    {op.type === "recette" ? "+" : "−"}
                    {formatEuros(Number(op.montant))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
