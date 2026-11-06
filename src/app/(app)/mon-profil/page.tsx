import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ProfilEnseignantForm from "@/components/ProfilEnseignantForm";
import { createClient } from "@/lib/supabase/server";
import type { ProfilEnseignant } from "@/lib/profilEnseignant";

/** Coordonnées et signature de l'enseignant (ou Directrice) lié au compte. */
export default async function MonProfilPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mon_profil_enseignant");
  const profil = (Array.isArray(data) ? data[0] : data) as ProfilEnseignant | null;
  if (error || !profil?.id) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 md:px-8">
      <PageHeader
        title="Mon profil"
        subtitle="Vos coordonnées et votre signature (utilisée sur les documents PDF)."
      />
      <ProfilEnseignantForm initial={profil} />
    </div>
  );
}
