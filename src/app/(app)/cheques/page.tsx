import PageHeader from "@/components/PageHeader";
import DepotCheques, { type DonDepot } from "@/components/DepotCheques";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import { toutesLesOperations } from "@/lib/operations";
import type { Cheque, InscriptionCandidate, OpRemise, Remise } from "@/lib/depotCheques";

export default async function DepotChequesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;

  const [{ data: remises, error }, { data: cheques }] = await Promise.all([
    supabase.from("remises_cheques").select("id, date_remise, photo_path, notes, operation_id, lien_operation, created_at").order("date_remise", { ascending: false }),
    supabase.from("cheques_remis").select("id, remise_id, montant, emetteur, date_cheque, motif, don_id, inscription_id, lien").order("created_at"),
  ]);

  // Rapprochement : réservé au Trésorier (la Directrice et le Président déposent et consultent).
  const peutLier = roleSlug === "tresorier";
  let operations: OpRemise[] = [];
  let dons: DonDepot[] = [];
  let inscriptions: InscriptionCandidate[] = [];
  if (peutLier) {
    // Crédits des 18 derniers mois (une remise ancienne reste rapprochable).
    const depuis = new Date();
    depuis.setMonth(depuis.getMonth() - 18);
    const [ops, { data: d }, { data: i }] = await Promise.all([
      toutesLesOperations<OpRemise>(supabase, "id, date_operation, montant, libelle, libelle_origine, parent_id", (q) =>
        q.eq("type", "recette").gte("date_operation", depuis.toISOString().slice(0, 10)),
      ),
      supabase
        .from("dons")
        .select("id, montant, date_don, operation_id, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre")
        .is("supprime_le", null)
        .gte("date_don", depuis.toISOString().slice(0, 10)),
      supabase.from("scolarite_inscriptions").select("id, annee_scolaire, famille_nom"),
    ]);
    // Une remise est créditée en une ligne : les sous-écritures d'une ventilation ne sont pas candidates.
    operations = ops.filter((o) => !o.parent_id);
    dons = (d ?? []) as DonDepot[];
    inscriptions = (i ?? []) as InscriptionCandidate[];
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Dépôt de chèques"
        subtitle="Photo de la remise (plusieurs chèques ou bordereau), puis une ligne par chèque. Préau relie la remise au crédit bancaire et chaque chèque au don ou à la famille quand c'est évident ; sinon, le Trésorier confirme."
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
          peutLier={peutLier}
        />
      )}
    </div>
  );
}
