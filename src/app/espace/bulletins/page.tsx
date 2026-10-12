import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import { estSynthese, type Synthese } from "@/lib/bulletins";
import BulletinsFamille, { type BulletinFamille } from "@/components/bulletins/BulletinsFamille";

/** Bulletins publiés des enfants de la famille (la base ne renvoie que ceux-là). */
export default async function BulletinsFamillePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);
  const { data } = await supabase
    .from("bulletins")
    .select("id, eleve_id, synthese, publie_le, lu_le, periodes(ordre, annee_scolaire)")
    .eq("statut", "publie")
    .order("publie_le", { ascending: false });
  const bulletins: BulletinFamille[] = ((data ?? []) as unknown as {
    id: string;
    eleve_id: string;
    synthese: unknown;
    publie_le: string | null;
    lu_le: string | null;
    periodes: { ordre: number; annee_scolaire: string } | null;
  }[])
    .filter((b) => estSynthese(b.synthese as Synthese))
    .map((b) => ({ id: b.id, eleveId: b.eleve_id, synthese: b.synthese as Synthese, publieLe: b.publie_le, luLe: b.lu_le, ordre: b.periodes?.ordre ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Bulletins</h1>
        <p className="text-sm text-muted">Les bulletins de vos enfants, dès leur publication par la Directrice.</p>
      </div>
      {apercu && (
        <p className="rounded-lg bg-gold-soft/60 px-3 py-2 text-center text-[13px] text-gold">
          Aperçu : les bulletins ne sont lisibles que par la famille et par l&apos;équipe enseignante ; ils n&apos;apparaissent pas ici.
        </p>
      )}
      <BulletinsFamille bulletins={bulletins} apercu={!!apercu} />
    </div>
  );
}
