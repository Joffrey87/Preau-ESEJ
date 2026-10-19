import { createClient } from "@/lib/supabase/server";
import { familleConsultee } from "@/lib/apercuFamille";
import AchatsDiversFamille, { type AchatFamille, type CoordonneesPaiement } from "@/components/AchatsDiversFamille";

/** Espace famille : achats divers (École et Événement) de la famille, sans détail interne. */
export default async function AchatsFamille() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleConsultee(user);
  const [a, c, ex] = await Promise.all([
    supabase.rpc("achats_divers_famille", { p_famille: apercu }),
    supabase.from("coordonnees_paiement").select("ordre_cheque, titulaire, iban, bic").maybeSingle(),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin").order("date_debut", { ascending: false }),
  ]);
  if (a.error) return <p className="text-sm text-negative">{a.error.message}</p>;
  const aujourdhui = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const exercices = (ex.data ?? []) as { id: string; libelle: string; date_debut: string; date_fin: string }[];
  const courant = exercices.find((e) => e.date_debut <= aujourdhui && aujourdhui <= e.date_fin)?.id ?? exercices[0]?.id ?? "";
  return (
    <AchatsDiversFamille
      achats={((a.data ?? []) as AchatFamille[]).map((x) => ({ ...x, montant: Number(x.montant), paye: Number(x.paye) }))}
      coordonnees={(c.data as CoordonneesPaiement | null) ?? null}
      exerciceCourant={courant}
      exercices={exercices.map((e) => ({ id: e.id, libelle: e.libelle.replace(/^Exercice\s+/i, "") }))}
    />
  );
}
