"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DONNEES_VIDES } from "@/lib/inscriptions";
import FormulaireInscription from "./FormulaireInscription";

export default function Preinscription({ annee }: { annee: string }) {
  const sb = useMemo(() => createClient(), []);
  const [fait, setFait] = useState(false);
  if (fait)
    return (
      <div className="rounded-xl border border-positive/40 bg-positive/10 p-6 text-center">
        <p className="font-semibold">Merci, votre demande de préinscription est bien reçue.</p>
        <p className="mt-1 text-sm text-muted">La Directrice l&apos;étudie et reviendra vers vous.</p>
      </div>
    );
  return (
    <FormulaireInscription
      initial={DONNEES_VIDES}
      dossierPhoto="preinscription"
      libelleBouton="Envoyer la demande de préinscription"
      envoyer={async (d, photo) => {
        const { error } = await sb.rpc("preinscription_deposer", { p_annee: annee, p_donnees: d, p_photo: photo });
        if (error) return error.message;
        setFait(true);
        return null;
      }}
    />
  );
}
