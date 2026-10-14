import PageHeader from "@/components/PageHeader";
import GestionCarnet from "@/components/GestionCarnet";
import SaisieGroupeeCarnet from "@/components/SaisieGroupeeCarnet";
import CarnetFamilles, { type FamilleCarnet, type PropositionFamille } from "@/components/CarnetFamilles";
import type { Eleve } from "@/lib/eleves";
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

  // Familles de l'école (dossiers familles) : profils qui voient les parents ; par défaut, celles de l'année en cours.
  const voitFamilles = categoriesAutorisees(slug).includes("parent");
  const maintenant = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const debut = maintenant.getMonth() >= 8 ? maintenant.getFullYear() : maintenant.getFullYear() - 1;
  const anneeEnCours = `${debut}-${debut + 1}`;
  const [{ data: toutesFamilles }, { data: tousEleves }, { data: propositions }] = voitFamilles
    ? await Promise.all([
        supabase
          .from("familles")
          .select("id, nom, adresse, cp_ville, parent1_prenom, parent1_nom, parent1_telephone, parent1_courriel, parent2_prenom, parent2_nom, parent2_telephone, parent2_courriel")
          .order("nom"),
        supabase.from("eleves").select("id, famille_id, prenom, initiale, classe_entree, annee_entree, decalage, sorti_le"),
        supabase.from("familles_propositions").select("id, famille_id, champ, ancien, nouveau, propose_le").eq("statut", "en_attente"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  // Modification des familles : profils qui gèrent la scolarité (la Directrice propose pour les familles de l'année).
  const peutModifierFamilles = ["president", "tresorier", "secretaire", "administrateur", "directrice"].includes(slug ?? "");

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
      {voitFamilles && (
        <CarnetFamilles
          familles={(toutesFamilles ?? []) as FamilleCarnet[]}
          eleves={(tousEleves ?? []) as (Eleve & { famille_id: string })[]}
          propositions={(propositions ?? []) as PropositionFamille[]}
          annee={anneeEnCours}
          peutModifier={peutModifierFamilles}
          directrice={slug === "directrice"}
        />
      )}
      {/* Saisie groupée : fiches du Carnet, réservées au Trésorier (droit d'écriture en base). */}
      {slug !== "directrice" && (
        <div className="mb-6">
          <SaisieGroupeeCarnet />
        </div>
      )}

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
