import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import GestionCaisses from "@/components/GestionCaisses";
import { sessionVentes } from "@/lib/ventesServeur";
import type { Caisse, CaisseMouvement } from "@/lib/caisses";

/** Caisses liquides école et événement (hors Comptabilité bancaire). */
export default async function CaissesPage() {
  const { supabase, domaines, peutModifier } = await sessionVentes("/caisses");
  if (!domaines.length) redirect("/");

  const [{ data: caisses }, { data: mouvements }, { data: soldes }] = await Promise.all([
    supabase.from("caisses").select("id, cle, nom, solde_initial").order("cle"),
    supabase.from("caisse_mouvements").select("id, caisse_id, date, libelle, montant, source, notes, created_at").order("date", { ascending: false }).limit(500),
    supabase.rpc("caisses_soldes"),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Caisses"
        subtitle="Liquidités hors banque : Caisse école, Caisse Événement, ou Caisse totale. Les paiements en espèces des ventes diverses y sont inscrits."
      />
      <GestionCaisses
        caisses={((caisses ?? []) as Caisse[]).map((c) => ({ ...c, solde_initial: Number(c.solde_initial) }))}
        mouvements={((mouvements ?? []) as CaisseMouvement[]).map((m) => ({ ...m, montant: Number(m.montant) }))}
        domaines={domaines}
        soldesTous={((soldes ?? []) as { cle: string; nom: string; solde: number }[]).map((s) => ({ ...s, solde: Number(s.solde) }))}
        peutModifier={peutModifier}
      />
    </div>
  );
}
