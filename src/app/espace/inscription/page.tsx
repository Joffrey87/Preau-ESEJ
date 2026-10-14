import { createClient } from "@/lib/supabase/server";
import { familleConsultee } from "@/lib/apercuFamille";
import { chargerEspace } from "@/lib/espaceFamille";
import { anneeInscriptions, enfantsAReinscrire, type StatutDossier } from "@/lib/inscriptions";
import { chargerFormulaire } from "@/lib/formulaireInscription";
import Reinscription from "@/components/inscriptions/Reinscription";

/** Réinscription : un dossier pré-rempli par enfant encore scolarisé l'an prochain (formulaire publié par la Directrice). */
export default async function ReinscriptionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleConsultee(user);
  const { espace, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;
  const annee = anneeInscriptions();
  const [{ data: dossiers }, { config }] = await Promise.all([
    supabase.from("inscriptions_dossiers").select("eleve_id, statut, created_at").eq("annee_scolaire", annee).order("created_at"),
    chargerFormulaire(supabase, "publie"),
  ]);
  const statutDe = new Map(((dossiers ?? []) as { eleve_id: string | null; statut: StatutDossier }[]).map((d) => [d.eleve_id, d.statut]));
  const enfants = enfantsAReinscrire(espace.famille, espace.eleves, annee, statutDe);
  return (
    <div className="space-y-4">
      <h1 className="text-center text-lg font-semibold">Réinscription · Année {annee}</h1>
      <Reinscription annee={annee} familleId={espace.famille.id} enfants={enfants} apercu={!!apercu} config={config} />
    </div>
  );
}
