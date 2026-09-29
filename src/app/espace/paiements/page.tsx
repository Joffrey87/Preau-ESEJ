import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import { formatEurosCourt as formatEuros, formatDate, todayISO } from "@/lib/format";
import { prenomEleve } from "@/lib/eleves";
import { chargerEspace, situation, anneeCourante } from "@/lib/espaceFamille";
import FraisScolariteFamille, { DossierAnneesPrecedentes, type AnneeFamille } from "@/components/FraisScolariteFamille";
import { BoutonAttestation } from "@/components/EspaceClient";
import type { NatureAttestee } from "@/lib/attestationPdf";

export default async function PaiementsFamille({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);
  const { espace, association, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;

  const aujourdhui = todayISO();
  const { annee: anneeParam } = await searchParams;
  const annees = espace.inscriptions.map((i) => i.annee_scolaire);
  const annee = anneeParam && annees.includes(anneeParam) ? anneeParam : anneeCourante(espace, aujourdhui);
  const activites = espace.activites.filter((a) => a.annee_scolaire === annee);
  const nom = espace.famille.nom;
  // L'année en cours dans le tableau ; les autres dans le dossier, sous les activités.
  const toutesAnnees = espace.inscriptions
    .map((i) => ({ annee: i.annee_scolaire, nbEnfants: i.nb_enfants, s: situation(espace, i.annee_scolaire, aujourdhui) }))
    .filter((x): x is AnneeFamille => x.s !== null);

  const attestation = (
    nature: NatureAttestee,
    montant: number,
    date: string,
    origine: string,
    mode: string | null,
    intitule?: string,
    enfant?: string | null,
  ) => ({ famille: nom, annee_scolaire: annee ?? "", nature, montant, date, origine, mode, intitule, enfant });

  return (
    <div className="space-y-6">
      <h1 className="text-center text-lg font-semibold">Paiements</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Frais de scolarité</h2>
        <FraisScolariteFamille
          famille={nom}
          association={association}
          annees={toutesAnnees.filter((a) => a.annee === annee)}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Activités</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          {activites.length === 0 ? (
            <p className="text-sm text-muted">Aucune activité pour le moment.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {activites.map((a) => (
                  <tr key={`${a.activite_id}-${a.eleve_id}`} className="border-b border-border/50 last:border-0">
                    <td className="py-2">
                      {a.titre}
                      {a.date_activite && <span className="ml-1 text-xs text-muted">({formatDate(a.date_activite)})</span>}
                    </td>
                    <td className="py-2 text-muted">{a.prenom || a.initiale ? prenomEleve(a) : ""}</td>
                    <td className="py-2 text-right tabular-nums">{formatEuros(Number(a.montant))}</td>
                    <td className="py-2 text-right">
                      {a.paye_le ? (
                        <span className="inline-flex items-center gap-2 text-xs text-positive">
                          payé le {formatDate(a.paye_le)}
                          <BoutonAttestation
                            association={association}
                            attestation={attestation("activite", Number(a.montant), a.paye_le, "Famille", null, a.titre, a.prenom || a.initiale ? prenomEleve(a) : null)}
                          />
                        </span>
                      ) : (
                        <span className="text-xs text-gold">
                          à régler{a.date_limite ? ` avant le ${formatDate(a.date_limite)}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <DossierAnneesPrecedentes
        famille={nom}
        association={association}
        annees={toutesAnnees.filter((a) => a.annee !== annee)}
      />
    </div>
  );
}
