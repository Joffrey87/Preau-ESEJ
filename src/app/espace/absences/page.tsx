import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import type { Absence } from "@/lib/absences";
import AbsencesFamille from "@/components/AbsencesFamille";

/** Absences et retards des enfants de la famille (la base ne renvoie que les siens). */
export default async function AbsencesFamillePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);
  const [a, e] = await Promise.all([
    supabase.from("absences").select("id, eleve_id, date, demi_journee, type, remarque").order("date", { ascending: false }),
    supabase.from("eleves").select("id, prenom, initiale"),
  ]);
  const prenoms = Object.fromEntries(((e.data ?? []) as { id: string; prenom: string | null; initiale: string | null }[]).map((x) => [x.id, x.prenom ?? `${x.initiale ?? ""}.`]));

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Absences</h1>
        <p className="text-sm text-muted">Les absences et retards de vos enfants, relevés à chaque demi-journée.</p>
      </div>
      {apercu && (
        <p className="rounded-lg bg-gold-soft/60 px-3 py-2 text-center text-[13px] text-gold">
          Aperçu : les absences ne sont lisibles que par la famille et par l&apos;équipe enseignante ; elles n&apos;apparaissent pas ici.
        </p>
      )}
      <AbsencesFamille absences={(a.data ?? []) as Absence[]} prenoms={prenoms} />
    </div>
  );
}
