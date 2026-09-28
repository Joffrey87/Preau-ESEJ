import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import { formatEurosCourt as formatEuros, formatDate, todayISO } from "@/lib/format";
import { chargerEspace, situation, anneeCourante } from "@/lib/espaceFamille";
import FraisScolariteFamille, { type AnneeFamille } from "@/components/FraisScolariteFamille";
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
      <h1 className="text-lg font-semibold">Paiements</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Frais de scolarité</h2>
        <FraisScolariteFamille
          famille={nom}
          association={association}
          anneeOuverte={annee}
          annees={espace.inscriptions
            .map((i) => ({ annee: i.annee_scolaire, nbEnfants: i.nb_enfants, s: situation(espace, i.annee_scolaire, aujourdhui) }))
            .filter((x): x is AnneeFamille => x.s !== null)}
        />
        <p className="mt-2 text-xs text-muted">
          Cliquez sur une année pour le détail des versements et les attestations de paiement. Une mensualité se règle
          avant la fin de son mois ; un montant en rouge est en retard, en orange à régler avant la fin du mois.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Activités{annee ? ` · ${annee}` : ""}</h2>
        {activites.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aucune activité pour le moment.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody>
              {activites.map((a) => (
                <tr key={`${a.activite_id}-${a.eleve_id}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2">
                    {a.titre}
                    {a.date_activite && <span className="ml-1 text-xs text-muted">({formatDate(a.date_activite)})</span>}
                  </td>
                  <td className="py-2 text-muted">{a.initiale ? `${a.initiale}.` : ""}</td>
                  <td className="py-2 text-right tabular-nums">{formatEuros(Number(a.montant))}</td>
                  <td className="py-2 text-right">
                    {a.paye_le ? (
                      <span className="inline-flex items-center gap-2 text-xs text-positive">
                        payé le {formatDate(a.paye_le)}
                        <BoutonAttestation
                          association={association}
                          attestation={attestation("activite", Number(a.montant), a.paye_le, "Famille", null, a.titre, a.initiale ? `${a.initiale}.` : null)}
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
      </section>
    </div>
  );
}
