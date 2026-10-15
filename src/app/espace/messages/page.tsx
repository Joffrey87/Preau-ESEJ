import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import Messagerie from "@/components/communication/Messagerie";

/** Messagerie de la famille : l'école (Direction, Secrétariat, Trésorerie, Événementiel) et les autres familles. */
export default async function MessagesFamillePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-sm text-muted">Écrivez à l&apos;école ou à une autre famille ; les réponses arrivent ici.</p>
      </div>
      {apercu ? (
        <p className="rounded-lg bg-gold-soft/60 px-3 py-2 text-center text-[13px] text-gold">
          Aperçu : les messages d&apos;une famille ne sont lisibles que par elle et par ses interlocuteurs ; ils n&apos;apparaissent pas ici.
        </p>
      ) : (
        <Messagerie cote="famille" />
      )}
    </div>
  );
}
