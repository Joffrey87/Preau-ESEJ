import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NouvelleOperation from "@/components/NouvelleOperation";
import { createClient } from "@/lib/supabase/server";
import { formatEuros, formatDate } from "@/lib/format";

type OperationRow = {
  id: string;
  date_operation: string;
  libelle: string;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categories: { nom: string } | null;
  comptes: { nom: string } | null;
};

export default async function ComptabilitePage() {
  const supabase = await createClient();

  const { data: exercice } = await supabase
    .from("exercices")
    .select("id, libelle")
    .eq("actif", true)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [opsRes, catsRes, comptesRes] = await Promise.all([
    exercice
      ? supabase
          .from("operations")
          .select(
            "id, date_operation, libelle, montant, type, mode_paiement, categories(nom), comptes(nom)",
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
                href="/comptabilite/import"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
              >
                Importer un relevé
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
                  <td className="px-4 py-3">{op.libelle}</td>
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
