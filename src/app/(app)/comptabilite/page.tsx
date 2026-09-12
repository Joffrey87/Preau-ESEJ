import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NouvelleOperation from "@/components/NouvelleOperation";
import ListeOperations from "@/components/ListeOperations";
import type { Affectation, Inscription } from "@/components/AffectationScolarite";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";
import { operationsRepertoriees } from "@/lib/rapprochementDons";

type OperationRow = {
  id: string;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categorie_id: string | null;
  compte_id: string | null;
  exercice_id: string | null;
  parent_id: string | null;
  est_ventilee: boolean;
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
    .select("id, libelle, actif, date_debut, date_fin")
    .order("date_debut", { ascending: false });
  const liste = exercices ?? [];
  const exercice =
    (exParam && liste.find((e) => e.id === exParam)) ||
    liste.find((e) => e.actif) ||
    liste[0] ||
    null;

  const [opsRes, catsRes, comptesRes, inscriptionsRes, affectationsRes] = await Promise.all([
    exercice
      ? supabase
          .from("operations")
          .select(
            "id, date_operation, libelle, libelle_origine, montant, type, mode_paiement, categorie_id, compte_id, exercice_id, parent_id, est_ventilee, categories(nom), comptes(nom)",
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
    // Fléchage des dons d'association vers les frais de scolarité.
    supabase
      .from("scolarite_inscriptions")
      .select("id, annee_scolaire, famille_nom, nb_enfants")
      .order("annee_scolaire", { ascending: false })
      .order("famille_nom"),
    supabase.from("affectations_scolarite").select("id, operation_id, inscription_id, montant, notes"),
  ]);

  // Dons (montant/date/lien) pour marquer les opérations « Don » déjà répertoriées.
  const { data: donsData } = await supabase
    .from("dons")
    .select("id, montant, date_don, operation_id")
    .is("supprime_le", null);
  const dons = donsData ?? [];
  const COLONNES =
    "id, date_operation, libelle, libelle_origine, montant, type, mode_paiement, categorie_id, compte_id, exercice_id, parent_id, est_ventilee, categories(nom), comptes(nom)";

  const operationsExercice = (opsRes.data ?? []) as unknown as OperationRow[];

  // Une ventilation doit TOUJOURS être chargée en entier, même si ses membres
  // relèvent d'exercices différents : un versement d'août peut couvrir la
  // rentrée suivante. Sans la famille complète, le volet afficherait un faux
  // déséquilibre, et une sous-écriture serait comptée sans être visible.
  //
  // On ferme donc la famille en deux temps : d'abord les mères, puis TOUTES
  // leurs filles.
  const chercher = async (
    connues: OperationRow[],
    ids: string[],
    colonne: "id" | "parent_id",
  ): Promise<OperationRow[]> => {
    if (ids.length === 0) return connues;
    const dejaLa = new Set(connues.map((o) => o.id));
    const { data } = await supabase.from("operations").select(COLONNES).in(colonne, ids);
    const nouvelles = ((data ?? []) as unknown as OperationRow[]).filter((o) => !dejaLa.has(o.id));
    return nouvelles.length > 0 ? [...connues, ...nouvelles] : connues;
  };

  // 1. Les lignes bancaires dont une sous-écriture est présente ici.
  const avecMeres = await chercher(
    operationsExercice,
    [...new Set(operationsExercice.map((o) => o.parent_id).filter((v): v is string => !!v))],
    "id",
  );

  // 2. Toutes les sous-écritures de chaque ligne ventilée, quel que soit leur exercice.
  const operations = await chercher(
    avecMeres,
    [...new Set(avecMeres.filter((o) => o.est_ventilee).map((o) => o.id))],
    "parent_id",
  );

  // Le lien explicite `dons.operation_id` fait foi ; à défaut, rapprochement
  // un-à-un par montant et date. Voir `lib/rapprochementDons`.
  const donsRepertories = [...operationsRepertoriees(operations, dons)];

  // Une ligne détaillée ne compte pas : ses sous-écritures portent les montants
  // et les catégories. La présence de filles fait foi, pas l'indicateur seul.
  const meres = new Set(operations.map((o) => o.parent_id).filter(Boolean) as string[]);
  const comptabilisees = operations.filter(
    (o) => !meres.has(o.id) && !o.est_ventilee && o.exercice_id === (exercice?.id ?? null),
  );
  const recettes = comptabilisees.filter((o) => o.type === "recette").reduce((s, o) => s + Number(o.montant), 0);
  const depenses = comptabilisees.filter((o) => o.type === "depense").reduce((s, o) => s + Number(o.montant), 0);

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
                Bilan
              </Link>
              <Link
                href="/comptabilite/correspondances"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Correspondances
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
            <div className="text-xs text-muted">Recettes · {comptabilisees.length} opérations</div>
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

      <ListeOperations
        operations={operations}
        categories={catsRes.data ?? []}
        comptes={comptesRes.data ?? []}
        exerciceId={exercice?.id ?? null}
        exercices={liste}
        donsRepertories={donsRepertories}
        inscriptions={(inscriptionsRes.data ?? []) as Inscription[]}
        affectations={(affectationsRes.data ?? []) as Affectation[]}
      />
    </div>
  );
}
