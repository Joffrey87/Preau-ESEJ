import { createClient } from "@/lib/supabase/server";
import { familleConsultee } from "@/lib/apercuFamille";
import { chargerEspace } from "@/lib/espaceFamille";
import { classeEn, prenomEleve } from "@/lib/eleves";
import { anneeInscriptions, DONNEES_VIDES, type StatutDossier } from "@/lib/inscriptions";
import Reinscription, { type EnfantReinscription } from "@/components/inscriptions/Reinscription";

/** Réinscription : un dossier pré-rempli par enfant encore scolarisé l'an prochain. */
export default async function ReinscriptionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleConsultee(user);
  const { espace, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;
  const annee = anneeInscriptions();
  const f = espace.famille;
  const { data: dossiers } = await supabase.from("inscriptions_dossiers").select("eleve_id, statut, created_at").eq("annee_scolaire", annee).order("created_at");
  const statutDe = new Map(((dossiers ?? []) as { eleve_id: string | null; statut: StatutDossier }[]).map((d) => [d.eleve_id, d.statut]));
  const enfants: EnfantReinscription[] = espace.eleves
    .filter((e) => !e.sorti_le && e.id && classeEn(e, annee) !== null)
    .map((e) => ({
      id: e.id as string,
      prenom: prenomEleve(e),
      classeSuivante: classeEn(e, annee),
      statut: statutDe.get(e.id as string) ?? null,
      donnees: {
        ...DONNEES_VIDES,
        enfant_prenom: prenomEleve(e),
        enfant_nom: f.nom,
        classe_demandee: classeEn(e, annee) ?? "",
        ecole_actuelle: "École du Saint-Enfant-Jésus",
        parent1_prenom: f.parent1_prenom ?? "",
        parent1_nom: f.parent1_nom ?? "",
        parent1_telephone: f.parent1_telephone ?? "",
        parent1_courriel: f.parent1_courriel ?? "",
        parent2_prenom: f.parent2_prenom ?? "",
        parent2_nom: f.parent2_nom ?? "",
        parent2_telephone: f.parent2_telephone ?? "",
        parent2_courriel: f.parent2_courriel ?? "",
        adresse: f.adresse ?? "",
        cp_ville: f.cp_ville ?? "",
      },
    }));
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Réinscription · Année {annee}</h1>
        <p className="text-sm text-muted">Choisissez un enfant, vérifiez les informations pré-remplies, puis envoyez le dossier à la Directrice.</p>
      </div>
      <Reinscription annee={annee} familleId={f.id} enfants={enfants} apercu={!!apercu} />
    </div>
  );
}
