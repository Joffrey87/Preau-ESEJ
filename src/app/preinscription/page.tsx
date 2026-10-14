import Preinscription from "@/components/inscriptions/Preinscription";
import EnTetePreinscription from "@/components/inscriptions/EnTetePreinscription";
import { anneeInscriptions } from "@/lib/inscriptions";
import { chargerFormulaire } from "@/lib/formulaireInscription";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Préinscription · École du Saint-Enfant-Jésus" };

/** Lien public de préinscription : une nouvelle famille remplit son dossier, sans compte (formulaire publié par la Directrice). */
export default async function PreinscriptionPage() {
  const annee = anneeInscriptions();
  const { config } = await chargerFormulaire(await createClient(), "publie");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <EnTetePreinscription annee={annee} />
      <Preinscription annee={annee} config={config} />
    </main>
  );
}
