import { createClient } from "@/lib/supabase/server";
import { familleConsultee } from "@/lib/apercuFamille";
import { todayISO } from "@/lib/format";
import { chargerEspace, anneeCourante, classeEn } from "@/lib/espaceFamille";
import { depuis, prenomEleve, termineEnJuin } from "@/lib/eleves";
import CoordonneesFamille from "@/components/CoordonneesFamille";
import PropositionsFamille from "@/components/PropositionsFamille";
import type { PropositionFamille } from "@/components/CarnetFamilles";
import NaissancesEnfants from "@/components/NaissancesEnfants";

export default async function MaFamille() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleConsultee(user);
  const { espace, association, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;
  const f = espace.famille;
  const annee = anneeCourante(espace, todayISO());
  const [{ data: campagne }, { data: propositions }] = await Promise.all([
    supabase.rpc("annee_revalidation"),
    supabase.from("familles_propositions").select("id, famille_id, champ, ancien, nouveau, propose_le").eq("famille_id", f.id).eq("statut", "en_attente").order("propose_le"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Famille {f.nom}</h1>
      <PropositionsFamille propositions={(propositions ?? []) as PropositionFamille[]} lectureSeule={!!apercu} />
      <CoordonneesFamille
        init={{
          adresse: f.adresse,
          cp_ville: f.cp_ville,
          parent1_prenom: f.parent1_prenom,
          parent1_nom: f.parent1_nom,
          parent1_telephone: f.parent1_telephone,
          parent1_courriel: f.parent1_courriel,
          parent2_prenom: f.parent2_prenom,
          parent2_nom: f.parent2_nom,
          parent2_telephone: f.parent2_telephone,
          parent2_courriel: f.parent2_courriel,
        }}
        campagne={(campagne as number | null) ?? null}
        revalide={campagne != null && f.revalide_annee === campagne}
        lectureSeule={!!apercu}
      />
      <p className="text-xs text-muted">
        Une question ? Écrivez à {association?.courriel_contact ?? "l'école"}.
      </p>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Enfants</h2>
        {espace.eleves.length === 0 ? (
          <p className="text-sm text-muted">La liste de vos enfants sera complétée par l&apos;école.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {espace.eleves.map((e) => {
              const c = annee ? classeEn(e, annee) : null;
              return (
                <li key={e.id}>
                  <span className="font-medium">{prenomEleve(e)}</span> — {c ?? "plus scolarisé à l'école"} · {depuis(e)}
                  {annee && termineEnJuin(e, annee) && (
                    <span className="ml-1 text-xs text-gold">dernière année (juin non dû pour cet enfant)</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <NaissancesEnfants ids={espace.eleves.filter((e) => !e.sorti_le).map((e) => e.id)} lectureSeule={!!apercu} />
    </div>
  );
}
