import PageHeader from "@/components/PageHeader";
import CourriersAConfirmer from "@/components/CourriersAConfirmer";
import type { Don } from "@/components/GestionDons";
import { createClient } from "@/lib/supabase/server";

export default async function CourriersPage() {
  const supabase = await createClient();
  // Fonction réservée au secrétaire et au bureau de trésorerie : seuls les dons des reçus à poster remis au secrétaire.
  const { data, error } = await supabase.rpc("courriers_a_confirmer");

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Courriers à confirmer"
        subtitle="Reçus fiscaux à poster : le reçu avec sa lettre de remerciement, l'adresse du donateur, et la confirmation une fois le courrier posté."
      />
      {error ? (
        <p className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">Lecture impossible : {error.message}</p>
      ) : (
        <CourriersAConfirmer donsInit={(data ?? []) as unknown as Don[]} />
      )}
    </div>
  );
}
