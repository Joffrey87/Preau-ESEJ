import PageHeader from "@/components/PageHeader";
import EnCours from "@/components/EnCours";
import { createClient } from "@/lib/supabase/server";
import { impayesScolarite, type Echeance, type InscriptionRow } from "@/lib/echeances";

const COLS_INSC =
  "famille_nom, annee_scolaire, emails, montant_mensuel, avance, m_sept, m_oct, m_nov, m_dec, m_jan, m_fev, m_mars, m_avr, m_mai, m_juin";

export default async function EnCoursPage() {
  const supabase = await createClient();

  // Année scolaire courante = la plus récente présente dans les inscriptions.
  const anneesRes = await supabase.from("scolarite_inscriptions").select("annee_scolaire");
  const annees = Array.from(new Set((anneesRes.data ?? []).map((r) => r.annee_scolaire))).sort((a, b) =>
    b.localeCompare(a),
  );
  const anneeCourante = annees[0] ?? "";

  const [echeancesRes, categoriesRes, inscriptionsRes] = await Promise.all([
    supabase.from("echeances").select("*").eq("statut", "en_attente"),
    supabase.from("categories").select("id, nom, type").order("nom"),
    anneeCourante
      ? supabase.from("scolarite_inscriptions").select(COLS_INSC).eq("annee_scolaire", anneeCourante)
      : Promise.resolve({ data: [] }),
  ]);

  const impayes = impayesScolarite((inscriptionsRes.data ?? []) as InscriptionRow[]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="En cours"
        subtitle="Ce qui n'est pas soldé : à encaisser, à régler, et les échéances connues à venir."
      />
      <EnCours
        echeances={(echeancesRes.data ?? []) as Echeance[]}
        categories={(categoriesRes.data ?? []) as { id: string; nom: string; type: "recette" | "depense" }[]}
        impayes={impayes}
        anneeScolaire={anneeCourante}
      />
    </div>
  );
}
