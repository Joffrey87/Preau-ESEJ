import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEurosCourt as formatEuros, formatDate, todayISO } from "@/lib/format";
import { chargerEspace, situation, anneeCourante } from "@/lib/espaceFamille";
import { BoutonAttestation } from "@/components/EspaceClient";
import type { NatureAttestee } from "@/lib/attestationPdf";

const MODES: Record<string, string> = { virement: "Virement", prelevement: "Prélèvement", cheque: "Chèque", carte: "Carte", especes: "Espèces" };

export default async function PaiementsFamille({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const supabase = await createClient();
  const { espace, association, erreur } = await chargerEspace(supabase);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;

  const aujourdhui = todayISO();
  const { annee: anneeParam } = await searchParams;
  const annees = espace.inscriptions.map((i) => i.annee_scolaire);
  const annee = anneeParam && annees.includes(anneeParam) ? anneeParam : anneeCourante(espace, aujourdhui);
  const s = annee ? situation(espace, annee, aujourdhui) : null;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Paiements</h1>
        {annees.length > 1 && (
          <div className="flex gap-1">
            {annees.map((a) => (
              <Link
                key={a}
                href={`/espace/paiements?annee=${a}`}
                className={`rounded-lg border px-3 py-1 text-sm ${a === annee ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"}`}
              >
                {a}
              </Link>
            ))}
          </div>
        )}
      </div>

      {!s ? (
        <p className="text-sm text-muted">Aucune inscription enregistrée.</p>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Frais de scolarité · {s.annee}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatEuros(s.mensuel)} × 10
            {s.partJuin.montant > 0 && ` − ${formatEuros(s.partJuin.montant)} (juin, fin de scolarité)`} ={" "}
            <strong className="text-foreground">{formatEuros(s.du)}</strong> · réglé{" "}
            <strong className="text-positive">{formatEuros(s.regle)}</strong> · reste{" "}
            <strong className={s.retard > 0 ? "text-negative" : s.reste < 0 ? "text-positive" : "text-foreground"}>
              {formatEuros(s.reste)}
            </strong>
          </p>
          {s.retard > 0 && (
            <p className="mt-2 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
              {formatEuros(s.retard)} en retard (mensualités des mois passés).
            </p>
          )}
          {s.retard === 0 && s.aReglerFinDeMois > 0 && (
            <p className="mt-2 rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">
              {formatEuros(s.aReglerFinDeMois)} à régler avant la fin du mois.
            </p>
          )}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Versement</th>
                <th className="py-2 font-medium">Payé par</th>
                <th className="py-2 text-right font-medium">Montant</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {s.lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted">Aucun versement enregistré.</td>
                </tr>
              )}
              {s.lignes.map((l, k) => (
                <tr key={k} className="border-b border-border/50 last:border-0">
                  <td className="py-2 tabular-nums">{l.date ? formatDate(l.date) : "—"}</td>
                  <td className="py-2">
                    {l.libelle}
                    {l.mode ? <span className="ml-1 text-xs text-muted">({MODES[l.mode] ?? l.mode})</span> : null}
                  </td>
                  <td className="py-2 text-muted">{l.origine}</td>
                  <td className="py-2 text-right tabular-nums">{formatEuros(l.montant)}</td>
                  <td className="py-2 text-right">
                    {l.date && l.montant > 0 && l.nature !== "classeur" && (
                      <BoutonAttestation
                        association={association}
                        attestation={attestation(l.nature, l.montant, l.date, l.origine, l.mode)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">Frais de dossier</div>
              <div className="text-xs text-muted">
                {s.frais.nouveaux > 0
                  ? `${formatEuros(s.frais.du)} attendus, ${formatEuros(s.frais.paye)} réglés`
                  : "Rien à régler cette année."}
              </div>
              {s.frais.details
                .filter((d) => d.type === "recette")
                .map((d, k) => (
                  <div key={k} className="mt-1 flex justify-between text-xs">
                    <span>
                      {formatDate(d.date_operation)} · {formatEuros(Number(d.montant))}
                    </span>
                    <BoutonAttestation
                      association={association}
                      attestation={attestation("frais_dossier", Number(d.montant), d.date_operation, d.origine ?? "Famille", null)}
                    />
                  </div>
                ))}
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">Mois d&apos;avance (dépôt)</div>
              <div className="text-xs text-muted">
                Attendu {formatEuros(s.depot.du)} · versé {formatEuros(s.depot.detenu)}
              </div>
              {s.depot.details
                .filter((d) => d.type === "recette")
                .map((d, k) => (
                  <div key={k} className="mt-1 flex justify-between text-xs">
                    <span>
                      {formatDate(d.date_operation)} · {formatEuros(Number(d.montant))}
                    </span>
                    <BoutonAttestation
                      association={association}
                      attestation={attestation("mois_avance", Number(d.montant), d.date_operation, d.origine ?? "Famille", null)}
                    />
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}

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
