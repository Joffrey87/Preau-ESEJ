"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ConfigFormulaire } from "@/lib/formulaireInscription";
import FormulaireInscription from "./FormulaireInscription";

export default function Preinscription({ annee, config, apercu = false }: { annee: string; config: ConfigFormulaire; apercu?: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [fait, setFait] = useState(false);
  if (fait)
    return (
      <div className="rounded-xl border border-positive/40 bg-positive/10 p-6 text-center">
        <p className="whitespace-pre-line font-semibold">{config.textes.pre.merci}</p>
      </div>
    );
  return (
    <>
      <p className="mb-5 whitespace-pre-line text-sm text-muted">{config.textes.pre.intro}</p>
      <FormulaireInscription
        config={config}
        type="pre"
        initial={{}}
        dossierFichiers="preinscription"
        libelleBouton="Envoyer la demande de préinscription"
        apercu={apercu}
        envoyer={async (d, photo) => {
          const { error } = await sb.rpc("preinscription_deposer", { p_annee: annee, p_donnees: d, p_photo: photo });
          if (error) return error.message;
          setFait(true);
          return null;
        }}
      />
    </>
  );
}
