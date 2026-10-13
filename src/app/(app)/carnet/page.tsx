import PageHeader from "@/components/PageHeader";
import GestionCarnet from "@/components/GestionCarnet";
import SaisieGroupeeCarnet from "@/components/SaisieGroupeeCarnet";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import {
  peutVoirContact,
  peutVoirIban,
  categoriesAutorisees,
  type Contact,
} from "@/lib/carnet";

export default async function CarnetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(await emailVue(user?.email));
  const slug = role?.slug;

  const { data } = await supabase
    .from("contacts")
    .select(
      "id, civilite, est_personne_morale, nom, prenom, raison_sociale, categories, courriel, telephone, adresse, cp_ville, iban, notes, relation, famille_statut, famille_id, supprime_le, supprime_par",
    )
    .order("nom", { ascending: true });

  // Familles de l'école liées aux fiches : nom et enfants, affichés sur la fiche.
  const idsFamilles = [...new Set(((data ?? []) as Contact[]).map((c) => c.famille_id).filter((x): x is string => !!x))];
  const [{ data: fams }, { data: enfants }] = await Promise.all([
    supabase.from("familles").select("id, nom").in("id", idsFamilles),
    supabase.from("eleves").select("famille_id, prenom, initiale, sorti_le").in("famille_id", idsFamilles),
  ]);
  const famillesLiees: Record<string, { nom: string; enfants: string[] }> = {};
  for (const f of (fams ?? []) as { id: string; nom: string }[]) famillesLiees[f.id] = { nom: f.nom, enfants: [] };
  for (const e of (enfants ?? []) as { famille_id: string; prenom: string | null; initiale: string | null; sorti_le: string | null }[]) {
    if (!e.sorti_le) famillesLiees[e.famille_id]?.enfants.push(e.prenom || (e.initiale ? `${e.initiale}.` : "?"));
  }

  // Relations déjà employées, partagées avec l'onglet Dons.
  const { data: origines } = await supabase.from("dons").select("origine").not("origine", "is", null);
  const relations = Array.from(
    new Set([
      ...(origines ?? []).map((d) => (d.origine ?? "").trim()),
      ...((data ?? []) as Contact[]).map((c) => (c.relation ?? "").trim()),
    ].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "fr"));

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
      <div className="mb-6">
        <SaisieGroupeeCarnet />
      </div>

      <GestionCarnet rechercheInitiale={q ?? ""}
        relations={relations}
        contacts={visibles}
        canVoirIban={canIban}
        categoriesGerables={categoriesAutorisees(slug)}
        roleLabel={role?.label ?? "—"}
        roleSlug={slug ?? null}
        famillesLiees={famillesLiees}
      />
    </div>
  );
}
