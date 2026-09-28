import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GestionScolarite, {
  type Inscription,
  type AffectationRecue,
} from "@/components/GestionScolarite";
import { createClient } from "@/lib/supabase/server";
import type { AffectationDetail, InscriptionDepot, NatureAffectation } from "@/lib/scolariteDepots";
import { estAmitieSainteAnne } from "@/lib/importEnrichi";
import type { FicheFamille } from "@/components/FamilleEnfants";
import type { Eleve } from "@/lib/eleves";

export default async function ScolaritePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabase = await createClient();
  const { annee: anneeParam } = await searchParams;

  // Années disponibles (barème + inscriptions), plus récente en tête.
  const [baremeAnneesRes, inscAnneesRes] = await Promise.all([
    supabase.from("scolarite_bareme").select("annee_scolaire"),
    supabase.from("scolarite_inscriptions").select("annee_scolaire"),
  ]);
  const annees = Array.from(
    new Set([
      ...(baremeAnneesRes.data ?? []).map((r) => r.annee_scolaire),
      ...(inscAnneesRes.data ?? []).map((r) => r.annee_scolaire),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  const annee = anneeParam && annees.includes(anneeParam) ? anneeParam : annees[0] ?? "";

  const [inscriptionsRes, baremeRes] = await Promise.all([
    supabase
      .from("scolarite_inscriptions")
      .select("*")
      .eq("annee_scolaire", annee)
      .order("famille_nom"),
    supabase
      .from("scolarite_bareme")
      .select("nb_enfants, montant_mensuel")
      .eq("annee_scolaire", annee),
  ]);

  // Affectations depuis la Comptabilité : dons d'association et mensualités
  // (comptés comme réglé pour l'année), mois d'avance et frais de dossier
  // (colonnes dédiées). Le dépôt suivant la famille d'une année sur l'autre,
  // on charge TOUTES les inscriptions et toutes les affectations, pas seulement
  // celles de l'année consultée.
  // Deux requêtes plutôt qu'une jointure : PostgREST ne connaît une relation
  // qu'après rechargement de son cache de schéma, ce qui rend l'imbrication
  // fragile juste après une migration.
  const [toutesRes, affRes] = await Promise.all([
    supabase
      .from("scolarite_inscriptions")
      .select("id, annee_scolaire, famille_nom, nb_enfants, montant_mensuel, avance, avance_consommee, depot_anterieur"),
    supabase.from("affectations_scolarite").select("inscription_id, operation_id, montant, nature"),
  ]);
  if (affRes.error) console.error("Lecture des affectations impossible :", affRes.error.message);

  const toutes = (toutesRes.data ?? []).map((i) => ({
    ...i,
    montant_mensuel: Number(i.montant_mensuel),
    avance: i.avance == null ? null : Number(i.avance),
    avance_consommee: i.avance_consommee == null ? 0 : Number(i.avance_consommee),
    depot_anterieur: i.depot_anterieur == null ? 0 : Number(i.depot_anterieur),
  })) as InscriptionDepot[];

  const brutes = (affRes.data ?? []) as {
    inscription_id: string;
    operation_id: string;
    montant: number;
    nature: NatureAffectation;
  }[];

  // Libellé, date, sens et payeur de l'opération d'origine (détail par famille).
  type OpInfo = { libelle: string; date_operation: string; type: "recette" | "depense"; origine: string };
  const parOperation = new Map<string, OpInfo>();
  if (brutes.length > 0) {
    type OpRow = {
      id: string; libelle: string; libelle_origine: string | null; date_operation: string;
      type: "recette" | "depense"; parent_id: string | null; categories: { nom: string } | null;
    };
    const { data: opsData } = await supabase
      .from("operations")
      .select("id, libelle, libelle_origine, date_operation, type, parent_id, categories(nom)")
      .in("id", [...new Set(brutes.map((a) => a.operation_id))]);
    const ops = (opsData ?? []) as unknown as OpRow[];
    // Le libellé bancaire d'une sous-écriture est celui de sa ligne bancaire.
    const parents = new Map<string, OpRow>();
    const idsParents = [...new Set(ops.map((o) => o.parent_id).filter((v): v is string => !!v))];
    if (idsParents.length > 0) {
      const { data: pData } = await supabase
        .from("operations")
        .select("id, libelle, libelle_origine, date_operation, type, parent_id, categories(nom)")
        .in("id", idsParents);
      for (const p of (pData ?? []) as unknown as OpRow[]) parents.set(p.id, p);
    }
    for (const o of ops) {
      const p = o.parent_id ? parents.get(o.parent_id) : undefined;
      const textes = `${o.libelle_origine ?? ""} ${o.libelle} ${p?.libelle_origine ?? ""} ${p?.libelle ?? ""}`;
      const origine = estAmitieSainteAnne(textes)
        ? "Amitié Sainte-Anne"
        : o.categories?.nom === "Don d'Association"
          ? "Association (tiers)"
          : "Famille";
      parOperation.set(o.id, { libelle: o.libelle, date_operation: o.date_operation, type: o.type, origine });
    }
  }

  const affectationsDetail: AffectationDetail[] = brutes.map((a) => ({
    inscription_id: a.inscription_id,
    nature: a.nature ?? "don_association",
    montant: Number(a.montant),
    libelle: parOperation.get(a.operation_id)?.libelle ?? "Opération",
    date_operation: parOperation.get(a.operation_id)?.date_operation ?? "",
    type: parOperation.get(a.operation_id)?.type ?? "recette",
    origine: parOperation.get(a.operation_id)?.origine,
  }));

  // Ce qui compte comme réglé pour l'année consultée : dons fléchés et mensualités.
  const idsInscriptions = new Set((inscriptionsRes.data ?? []).map((i) => (i as Inscription).id));
  const affectations: AffectationRecue[] = affectationsDetail
    .filter((a) => idsInscriptions.has(a.inscription_id) && (a.nature === "don_association" || a.nature === "mensualite"))
    .map((a) => ({
      inscription_id: a.inscription_id,
      montant: a.type === "depense" ? -a.montant : a.montant,
      libelle: a.libelle,
      date_operation: a.date_operation,
      nature: a.nature,
    }));

  // Familles (fiche) et élèves (prénom chiffré), pour le détail d'une famille.
  const [famillesRes, elevesRes] = await Promise.all([
    supabase.from("familles").select("id, nom, parent1, parent2, adresse, cp_ville, telephone, courriels, notes"),
    supabase.from("eleves").select("id, famille_id, prenom_chiffre, initiale, classe_entree, annee_entree, decalage, sorti_le"),
  ]);

  const bareme: Record<number, number> = {};
  for (const b of baremeRes.data ?? []) bareme[b.nb_enfants] = Number(b.montant_mensuel);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Frais de scolarité"
        subtitle="Suivi des paiements par famille : dû, réglé, reste à percevoir et mois d'avance."
        action={
          <div className="flex gap-2">
            <Link href="/scolarite/eleves" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
              Élèves
            </Link>
            <Link
              href={`/scolarite/activites?annee=${encodeURIComponent(annee)}`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Activités
            </Link>
          </div>
        }
      />
      {annees.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center text-muted">
          Aucune donnée de scolarité.
        </div>
      ) : (
        <GestionScolarite
          annee={annee}
          annees={annees}
          inscriptions={(inscriptionsRes.data ?? []) as Inscription[]}
          bareme={bareme}
          affectations={affectations}
          toutesInscriptions={toutes}
          affectationsDetail={affectationsDetail}
          familles={(famillesRes.data ?? []) as FicheFamille[]}
          eleves={(elevesRes.data ?? []) as Eleve[]}
        />
      )}
    </div>
  );
}
