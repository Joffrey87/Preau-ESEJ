"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { LIBELLE_DON, chiffrerLibellesDon, dechiffrerLibellesDon } from "@/lib/libelleDon";

type OpDon = {
  id: string;
  libelle: string;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
};

/**
 * Chiffrement des libellés des opérations « Don » déjà en comptabilité (toutes
 * années) : libellé neutre « Don », libellé bancaire et libellé saisi chiffrés
 * avec le coffre. Ponctuel — les nouveaux imports le font d'eux-mêmes.
 */
export default function ChiffrerLibellesDons() {
  const router = useRouter();
  const coffre = useCoffre();
  const [aTraiter, setATraiter] = useState<OpDon[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!coffre.estOuvert) return;
    let annule = false;
    (async () => {
      const supabase = createClient();
      const { data: cat } = await supabase.from("categories").select("id").eq("nom", "Don").eq("type", "recette").maybeSingle();
      if (!cat) return;
      const { data } = await supabase
        .from("operations")
        .select("id, libelle, libelle_origine, libelle_origine_chiffre")
        .eq("categorie_id", cat.id)
        .or(`libelle_origine.not.is.null,libelle.neq.${LIBELLE_DON}`)
        .limit(1000);
      if (!annule) setATraiter((data ?? []) as OpDon[]);
    })();
    return () => {
      annule = true;
    };
  }, [coffre.estOuvert]);

  if (!coffre.estOuvert || !aTraiter || aTraiter.length === 0) return null;

  async function chiffrer() {
    if (!aTraiter) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    let faits = 0;
    for (const op of aTraiter) {
      // Un chiffrement antérieur est complété, jamais écrasé.
      const avant = await dechiffrerLibellesDon(coffre.dechiffrer, op.libelle_origine_chiffre);
      const blob = await chiffrerLibellesDon(coffre.chiffrer, {
        brut: op.libelle_origine ?? avant?.brut ?? null,
        libelle: op.libelle !== LIBELLE_DON ? op.libelle : (avant?.libelle ?? null),
      });
      const { error } = await supabase
        .from("operations")
        .update({ libelle: LIBELLE_DON, libelle_origine: null, libelle_origine_chiffre: blob })
        .eq("id", op.id);
      if (!error) faits++;
    }
    setBusy(false);
    setMessage(`${faits} libellé${faits > 1 ? "s" : ""} de don chiffré${faits > 1 ? "s" : ""}.`);
    setATraiter([]);
    router.refresh();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-2.5 text-sm">
      <span className="text-gold">
        {aTraiter.length} opération{aTraiter.length > 1 ? "s" : ""} « Don » (toutes années) portent encore un nom de donateur en clair dans leur libellé.
      </span>
      <button
        type="button"
        onClick={chiffrer}
        disabled={busy}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Chiffrement…" : "Chiffrer les libellés des dons"}
      </button>
      {message && <span className="text-xs text-positive">{message}</span>}
    </div>
  );
}
