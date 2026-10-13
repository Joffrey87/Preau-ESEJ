import PageHeader from "@/components/PageHeader";
import DepotCheques, { type DonDepot } from "@/components/DepotCheques";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import { toutesLesOperations } from "@/lib/operations";
import { COLONNES_CHEQUE, type ActiviteCandidate, type Cheque, type FamilleCandidate, type InscriptionCandidate, type OpRemise, type ParticipationCandidate, type Remise } from "@/lib/depotCheques";

export default async function DepotChequesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;

  const [{ data: remises, error }, { data: cheques }] = await Promise.all([
    supabase.from("remises_cheques").select("id, date_remise, photo_path, notes, operation_id, lien_operation, created_at").order("date_remise", { ascending: false }),
    supabase.from("cheques_remis").select(COLONNES_CHEQUE).order("created_at"),
  ]);

  // Rapprochement : réservé au Trésorier (la Directrice et le Président déposent et consultent).
  const peutLier = roleSlug === "tresorier";
  let operations: OpRemise[] = [];
  let dons: DonDepot[] = [];
  let inscriptions: InscriptionCandidate[] = [];
  let familles: FamilleCandidate[] = [];
  let activites: ActiviteCandidate[] = [];
  let participations: ParticipationCandidate[] = [];
  if (peutLier) {
    // Crédits des 18 derniers mois (une remise ancienne reste rapprochable).
    const depuis = new Date();
    depuis.setMonth(depuis.getMonth() - 18);
    const [ops, { data: d }, { data: i }, { data: f }, { data: a }, { data: p }] = await Promise.all([
      toutesLesOperations<OpRemise>(supabase, "id, date_operation, montant, libelle, libelle_origine, parent_id", (q) =>
        q.eq("type", "recette").gte("date_operation", depuis.toISOString().slice(0, 10)),
      ),
      supabase
        .from("dons")
        .select("id, montant, date_don, operation_id, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre")
        .is("supprime_le", null)
        .gte("date_don", depuis.toISOString().slice(0, 10)),
      supabase.from("scolarite_inscriptions").select("id, annee_scolaire, famille_nom"),
      supabase.from("familles").select("id, nom"),
      supabase.from("activites").select("id, titre, annee_scolaire, date_activite"),
      // Participations encore à payer (pour proposer l'activité d'un chèque de famille).
      supabase.from("activites_participations").select("activite_id, montant, eleves(famille_id)").is("paye_le", null),
    ]);
    familles = (f ?? []) as FamilleCandidate[];
    activites = (a ?? []) as ActiviteCandidate[];
    participations = ((p ?? []) as unknown as { activite_id: string; montant: number; eleves: { famille_id: string } | null }[])
      .filter((x) => x.eleves)
      .map((x) => ({ activite_id: x.activite_id, montant: Number(x.montant), famille_id: x.eleves!.famille_id }));
    // Une remise est créditée en une ligne : les sous-écritures d'une ventilation ne sont pas candidates.
    operations = ops.filter((o) => !o.parent_id);
    dons = (d ?? []) as DonDepot[];
    inscriptions = (i ?? []) as InscriptionCandidate[];
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Dépôt de chèques"
      />
      {error ? (
        <p className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">Lecture impossible : {error.message}</p>
      ) : (
        <DepotCheques
          remisesInit={(remises ?? []) as Remise[]}
          chequesInit={(cheques ?? []) as Cheque[]}
          operations={operations}
          donsInit={dons}
          inscriptions={inscriptions}
          familles={familles}
          activites={activites}
          participations={participations}
          peutLier={peutLier}
        />
      )}
    </div>
  );
}
