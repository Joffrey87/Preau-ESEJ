import PageHeader from "@/components/PageHeader";
import GestionCarnet from "@/components/GestionCarnet";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import {
  peutVoirContact,
  peutVoirIban,
  categoriesAutorisees,
  type Contact,
} from "@/lib/carnet";

export default async function CarnetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(user?.email);
  const slug = role?.slug;

  const { data } = await supabase
    .from("contacts")
    .select(
      "id, civilite, est_personne_morale, nom, prenom, raison_sociale, categories, courriel, telephone, adresse, cp_ville, iban, notes",
    )
    .order("nom", { ascending: true });

  const canIban = peutVoirIban(slug);

  // Filtrage par rôle côté serveur : on ne renvoie que les contacts autorisés,
  // et on masque l'IBAN si le rôle n'y a pas droit.
  const visibles = ((data ?? []) as Contact[])
    .filter((c) => peutVoirContact(c, slug))
    .map((c) => (canIban ? c : { ...c, iban: null }));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Carnet d'adresses"
        subtitle="Contacts de l'association · l'accès dépend de votre profil."
      />
      <GestionCarnet
        contacts={visibles}
        canVoirIban={canIban}
        categoriesGerables={categoriesAutorisees(slug)}
        roleLabel={role?.label ?? "—"}
      />
    </div>
  );
}
