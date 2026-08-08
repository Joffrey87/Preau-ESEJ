import PageHeader from "@/components/PageHeader";
import EnCours from "@/components/EnCours";
import { createClient } from "@/lib/supabase/server";
import { type Echeance } from "@/lib/echeances";

export default async function EnCoursPage() {
  const supabase = await createClient();

  const [echeancesRes, categoriesRes] = await Promise.all([
    supabase.from("echeances").select("*").eq("statut", "en_attente"),
    supabase.from("categories").select("id, nom, type").order("nom"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="En cours"
        subtitle="Ce qui n'est pas soldé : à encaisser, à régler, et les échéances connues à venir."
      />
      <EnCours
        echeances={(echeancesRes.data ?? []) as Echeance[]}
        categories={(categoriesRes.data ?? []) as { id: string; nom: string; type: "recette" | "depense" }[]}
      />
    </div>
  );
}
