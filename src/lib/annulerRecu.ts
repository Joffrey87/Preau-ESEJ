// Suppression d'un reçu fiscal : confirmation (renforcée si le reçu est déjà parti) puis RPC `annuler_recu`.

import { createClient } from "@/lib/supabase/client";

/** Retourne null si l'utilisateur renonce, sinon le résultat de l'annulation. */
export async function supprimerRecu(numero: string, envoye: boolean): Promise<{ error: string | null } | null> {
  const message = envoye
    ? `ATTENTION : le reçu ${numero} a déjà été envoyé au donateur.\n\nLe supprimer efface son numéro et son suivi d'envoi ; ses dons redeviendront « à établir ». Le donateur détient déjà le document.\n\nConfirmer la suppression ?`
    : `Supprimer le reçu ${numero} ?\n\nSes dons redeviendront « à établir » ; le numéro est effacé.`;
  if (!window.confirm(message)) return null;
  const { error } = await createClient().rpc("annuler_recu", { p_recu: numero, p_forcer: envoye });
  return { error: error?.message ?? null };
}
