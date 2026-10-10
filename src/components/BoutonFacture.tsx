"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { telechargerFacture, type Facture } from "@/lib/facturePdf";

/**
 * Facture d'un paiement (une par écriture de Comptabilité). La première édition attribue son numéro (AAAAMMJJ-n) ;
 * ensuite le même numéro et la même facture sont redonnés.
 */
export default function BoutonFacture({ operationId, numero }: { operationId: string; numero?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErreur(null);
          const { data, error } = await createClient().rpc("facture_operation", { p_operation: operationId });
          if (error || !data) {
            setBusy(false);
            return setErreur(error?.message ?? "Facture indisponible.");
          }
          try {
            await telechargerFacture(data as Facture);
            router.refresh();
          } catch (e) {
            setErreur(e instanceof Error ? e.message : "Génération impossible.");
          }
          setBusy(false);
        }}
        title={numero ? `Facture ${numero} : télécharger à nouveau` : "Éditer la facture de ce paiement (numéro attribué à la première édition)"}
        className="text-xs text-accent hover:underline disabled:opacity-50"
      >
        {busy ? "…" : numero ? `Facture ${numero}` : "Facture"}
      </button>
      {erreur && <span className="max-w-[16rem] text-right text-[11px] text-negative">{erreur}</span>}
    </span>
  );
}
