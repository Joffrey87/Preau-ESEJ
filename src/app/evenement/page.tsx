import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import EspaceEvenement, { type EvenementCaisse, type MembreEvenement } from "@/components/EspaceEvenement";

/** Espace « Événement » : les membres, les événements et leur caisse. Rien d'autre (RLS). */
export default async function EvenementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: membres }, { data: evenements }] = await Promise.all([
    supabase.from("evenement_membres").select("id, libelle, prenom, nom, courriel, user_id, famille:familles(nom, membre_recherche)").order("libelle"),
    supabase.from("evenements_caisse").select("id, nom, date, responsable_id, caisse_avant, caisse_apres").order("date", { ascending: false }),
  ]);
  const moi = (membres ?? []).find((m) => m.user_id === user.id);
  // Président et Directrice : lecture seule (la base le garantit aussi).
  const espace = (user.app_metadata as { espace?: string } | undefined)?.espace;
  const peutModifier = espace === "evenement" || roleByEmail(user.email)?.slug === "tresorier";
  return (
    <EspaceEvenement
      peutModifier={peutModifier}
      prenom={moi?.prenom ?? null}
      membres={(membres ?? []) as unknown as MembreEvenement[]}
      evenements={(evenements ?? []) as EvenementCaisse[]}
    />
  );
}
