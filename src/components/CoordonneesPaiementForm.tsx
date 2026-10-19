"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Coord = { ordre_cheque: string; titulaire: string; iban: string; bic: string };
const VIDE: Coord = { ordre_cheque: "", titulaire: "", iban: "", bic: "" };
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

/** Paramètres (Trésorier) : ordre des chèques et RIB affichés aux familles pour les achats à régler. */
export default function CoordonneesPaiementForm() {
  const [c, setC] = useState<Coord>(VIDE);
  const [etat, setEtat] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .from("coordonnees_paiement")
      .select("ordre_cheque, titulaire, iban, bic")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setC({ ordre_cheque: data.ordre_cheque ?? "", titulaire: data.titulaire ?? "", iban: data.iban ?? "", bic: data.bic ?? "" });
      });
  }, []);
  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEtat(null);
    const v = (t: string) => t.trim() || null;
    const { error } = await createClient()
      .from("coordonnees_paiement")
      .update({ ordre_cheque: v(c.ordre_cheque), titulaire: v(c.titulaire), iban: v(c.iban.replace(/\s+/g, " ").toUpperCase()), bic: v(c.bic.toUpperCase()), updated_at: new Date().toISOString() })
      .eq("id", 1);
    setEtat(error ? "Erreur : " + error.message : "Enregistré.");
  }
  const champ = (k: keyof Coord, label: string, ph: string) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} placeholder={ph} className={input} />
    </label>
  );
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Coordonnées de paiement des familles</h2>
      <p className="mb-3 text-sm text-muted">
        Affichées aux parents dans l&apos;Espace famille (onglet Achats divers) pour régler un achat en attente. Laissez vide ce que vous ne souhaitez pas proposer.
      </p>
      <form onSubmit={enregistrer} className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-2">
        {champ("ordre_cheque", "Chèque à l'ordre de", "ex. ARIL")}
        {champ("titulaire", "Titulaire du compte (virement)", "ex. ARIL")}
        {champ("iban", "IBAN", "FR76 …")}
        {champ("bic", "BIC", "CMCIFR2A")}
        <div className="flex items-center gap-3 md:col-span-2">
          <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90">
            Enregistrer
          </button>
          {etat && <span className={`text-sm ${etat.startsWith("Erreur") ? "text-negative" : "text-positive"}`}>{etat}</span>}
        </div>
      </form>
    </section>
  );
}
