import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NouvelleOperation from "@/components/NouvelleOperation";
import ListeOperations from "@/components/ListeOperations";
import type { Affectation, Inscription } from "@/components/AffectationScolarite";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";
import { toutesLesOperations } from "@/lib/operations";
import { rapprocherDons, type Rapprochement } from "@/lib/rapprochementDons";
import type { DonCompta } from "@/components/PastilleDon";

type OperationRow = {
  id: string;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categorie_id: string | null;
  compte_id: string | null;
  exercice_id: string | null;
  parent_id: string | null;
  est_ventilee: boolean;
  a_verifier: string | null;
  categories: { nom: string } | null;
  comptes: { nom: string } | null;
};

const COLONNES =
  "id, date_operation, libelle, libelle_origine, libelle_origine_chiffre, montant, type, mode_paiement, categorie_id, compte_id, exercice_id, parent_id, est_ventilee, a_verifier, categories(nom), comptes(nom)";

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ exercice?: string; annee?: string }>;
}) {
  const supabase = await createClient();
  const { exercice: exParam, annee: anneeParam } = await searchParams;

  // Tous les exercices (pour le sélecteur). Par défaut : l'exercice qui couvre
  // la date du jour (septembre → août), sinon celui marqué actif, sinon le plus
  // récent. La date seule fait foi : l'onglet s'ouvre sur l'année en cours dès
  // le 1er septembre, sans attendre qu'on bascule l'indicateur actif.
  const { data: exercices } = await supabase
    .from("exercices")
    .select("id, libelle, actif, date_debut, date_fin")
    .order("date_debut", { ascending: false });
  const liste = exercices ?? [];
  const aujourdhui = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const exerciceDuJour =
    liste.find((e) => e.date_debut <= aujourdhui && aujourdhui <= e.date_fin) ||
    liste.find((e) => e.actif) ||
    liste[0] ||
    null;

  // Sélection : plusieurs exercices, OU plusieurs années civiles (janvier →
  // décembre, d'après la date de l'opération). Les deux lignes de boutons sont
  // exclusives : choisir une année quitte le mode exercice, et inversement.
  const anneeCourante = Number(aujourdhui.slice(0, 4));
  const anneesProposees = [anneeCourante, anneeCourante - 1, anneeCourante - 2];
  const annees = (anneeParam ?? "")
    .split(",")
    .map(Number)
    .filter((a) => anneesProposees.includes(a))
    .sort((a, b) => b - a);
  const idsDemandes = (exParam ?? "").split(",").filter(Boolean);
  const exercicesChoisis =
    annees.length > 0
      ? []
      : liste.filter((e) => idsDemandes.includes(e.id)).length > 0
        ? liste.filter((e) => idsDemandes.includes(e.id))
        : exerciceDuJour
          ? [exerciceDuJour]
          : [];
  const selection = { exercices: exercicesChoisis.map((e) => e.id), annees };
  // Exercice proposé par défaut à la saisie : le plus récent de la sélection,
  // ou celui du jour en mode année.
  const exercice = exercicesChoisis[0] ?? exerciceDuJour;
  const anneeDe = (o: { date_operation: string }) => Number(o.date_operation.slice(0, 4));
  const estRetenue = (o: { exercice_id: string | null; date_operation: string }) =>
    annees.length > 0 ? annees.includes(anneeDe(o)) : !!o.exercice_id && selection.exercices.includes(o.exercice_id);

  const chargerSelection = async (): Promise<OperationRow[]> => {
    if (annees.length === 0 && selection.exercices.length === 0) return [];
    // Plusieurs exercices ou années peuvent dépasser le plafond de 1000 lignes : on pagine.
    const lignes = await toutesLesOperations<OperationRow & { created_at: string }>(
      supabase,
      `${COLONNES}, created_at`,
      (q) =>
        annees.length > 0
          ? q.gte("date_operation", `${Math.min(...annees)}-01-01`).lte("date_operation", `${Math.max(...annees)}-12-31`)
          : q.in("exercice_id", selection.exercices),
    );
    return lignes
      .filter(estRetenue)
      .sort((a, b) => b.date_operation.localeCompare(a.date_operation) || b.created_at.localeCompare(a.created_at));
  };

  const [operationsExercice, catsRes, comptesRes, inscriptionsRes, affectationsRes, majRes] = await Promise.all([
    chargerSelection(),
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
    supabase.from("affectations_scolarite").select("id, operation_id, inscription_id, montant, notes, nature"),
    supabase.rpc("date_maj_comptes"),
  ]);

  // Dons, pour la pastille des opérations « Don » : relié ou trouvé, et fiche
  // complète ou non (coordonnées chiffrées : jugées dans le navigateur).
  const { data: donsData } = await supabase
    .from("dons")
    .select(
      "id, operation_id, exercice_id, montant, date_don, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, mode_paiement, recu_numero, recu_etat, pii_chiffre",
    )
    .is("supprime_le", null);
  const dons = (donsData ?? []) as DonCompta[];

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
  const rapprochements = rapprocherDons(operations, dons);
  const donsRepertories = [...rapprochements.keys()];
  const rapprochementsDons: Record<string, Rapprochement> = Object.fromEntries(rapprochements);
  // Seuls les dons concernés par cette page partent vers le navigateur.
  const idsDons = new Set([...rapprochements.values()].map((r) => r.donId));
  const donsCompta = dons.filter((d) => idsDons.has(d.id));

  // Une ligne détaillée ne compte pas : ses sous-écritures portent les montants
  // et les catégories. La présence de filles fait foi, pas l'indicateur seul.
  const meres = new Set(operations.map((o) => o.parent_id).filter(Boolean) as string[]);
  const comptabilisees = operations.filter((o) => !meres.has(o.id) && !o.est_ventilee && estRetenue(o));

  // Liens des boutons : un clic ajoute ou retire l'élément de la sélection. La
  // dernière case ne se décoche pas (retirer la dernière année ramène au mode
  // exercice, sur l'exercice du jour).
  const basculer = <T,>(liste: T[], v: T) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  const lienExercice = (id: string) => {
    const ids = annees.length > 0 ? [id] : basculer(selection.exercices, id);
    return ids.length > 0 ? `/comptabilite?exercice=${ids.join(",")}` : `/comptabilite?exercice=${id}`;
  };
  const lienAnnee = (a: number) => {
    const as = basculer(annees, a);
    return as.length > 0 ? `/comptabilite?annee=${as.join(",")}` : "/comptabilite";
  };
  const libelleSelection =
    annees.length > 0
      ? `Année${annees.length > 1 ? "s" : ""} ${[...annees].sort().join(", ")}`
      : exercicesChoisis
          .map((e) => e.libelle)
          .reverse()
          .join(" + ");
  const boutonCls = (actif: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm ${
      actif ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
    }`;
  const recettes = comptabilisees.filter((o) => o.type === "recette").reduce((s, o) => s + Number(o.montant), 0);
  const depenses = comptabilisees.filter((o) => o.type === "depense").reduce((s, o) => s + Number(o.montant), 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Comptabilité"
        subtitle={libelleSelection ? `Recettes et dépenses · ${libelleSelection}` : "Recettes et dépenses de l'exercice."}
        maj={(majRes.data as string | null) ?? null}
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

      {liste.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-sm text-muted">Exercice</span>
            {liste.map((e) => (
              <Link
                key={e.id}
                href={lienExercice(e.id)}
                title="Cliquer pour ajouter ou retirer cet exercice de l'affichage"
                className={boutonCls(selection.exercices.includes(e.id))}
              >
                {e.libelle.replace("Exercice ", "")}
                {e.actif ? " •" : ""}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 text-sm text-muted">Année</span>
            {anneesProposees.map((a) => (
              <Link
                key={a}
                href={lienAnnee(a)}
                title={`Opérations datées du 1er janvier au 31 décembre ${a} — cliquer pour ajouter ou retirer cette année`}
                className={boutonCls(annees.includes(a))}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
      )}

      {operations.length > 0 && (
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
        selection={selection}
        exercices={liste}
        donsRepertories={donsRepertories}
        rapprochementsDons={rapprochementsDons}
        donsCompta={donsCompta}
        inscriptions={(inscriptionsRes.data ?? []) as Inscription[]}
        affectations={(affectationsRes.data ?? []) as Affectation[]}
      />
    </div>
  );
}
