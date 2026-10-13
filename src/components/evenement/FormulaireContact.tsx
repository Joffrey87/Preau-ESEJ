"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bouton, champ, type ContactEvenement } from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

/** Ajout / modification d'un fournisseur ou contact événement (fonction `enregistrer_contact_evenement`). */
export default function FormulaireContact({ contact, onFini }: { contact?: ContactEvenement; onFini?: () => void }) {
  const supabase = createClient();
  const { erreur, occupe, executer } = useEnregistrer();
  const [c, setC] = useState({
    categorie: contact?.categories.includes("evenement") ? "evenement" : "vendeur",
    morale: contact?.est_personne_morale ?? true,
    raison_sociale: contact?.raison_sociale ?? "",
    nom: contact?.nom ?? "",
    prenom: contact?.prenom ?? "",
    courriel: contact?.courriel ?? "",
    telephone: contact?.telephone ?? "",
    adresse: contact?.adresse ?? "",
    cp_ville: contact?.cp_ville ?? "",
    notes: contact?.notes ?? "",
  });
  const maj = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value });

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const ok = await executer(() =>
      supabase.rpc("enregistrer_contact_evenement", {
        p_id: contact?.id ?? null,
        p_categorie: c.categorie,
        p_personne_morale: c.morale,
        p_nom: c.morale ? c.raison_sociale : c.nom,
        p_prenom: c.morale ? null : c.prenom,
        p_raison_sociale: c.morale ? c.raison_sociale : null,
        p_courriel: c.courriel,
        p_telephone: c.telephone,
        p_adresse: c.adresse,
        p_cp_ville: c.cp_ville,
        p_notes: c.notes,
      }),
    );
    if (ok) onFini?.();
  }

  return (
    <form onSubmit={enregistrer} className="grid gap-3 sm:grid-cols-3">
      <select value={c.categorie} onChange={maj("categorie")} className={champ}>
        <option value="vendeur">Fournisseur / prestataire</option>
        <option value="evenement">Contact événements</option>
      </select>
      <select value={c.morale ? "1" : "0"} onChange={(e) => setC({ ...c, morale: e.target.value === "1" })} className={champ}>
        <option value="1">Entreprise / organisme</option>
        <option value="0">Personne</option>
      </select>
      {c.morale ? (
        <input required placeholder="Raison sociale" value={c.raison_sociale} onChange={maj("raison_sociale")} className={champ} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Prénom" value={c.prenom} onChange={maj("prenom")} className={champ} />
          <input required placeholder="Nom" value={c.nom} onChange={maj("nom")} className={champ} />
        </div>
      )}
      <input type="email" placeholder="Courriel" value={c.courriel} onChange={maj("courriel")} className={champ} />
      <input placeholder="Téléphone" value={c.telephone} onChange={maj("telephone")} className={champ} />
      <input placeholder="Adresse" value={c.adresse} onChange={maj("adresse")} className={champ} />
      <input placeholder="CP et ville" value={c.cp_ville} onChange={maj("cp_ville")} className={champ} />
      <input placeholder="Notes" value={c.notes} onChange={maj("notes")} className={`${champ} sm:col-span-2`} />
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={occupe} className={bouton}>
          {contact ? "Enregistrer" : "Ajouter"}
        </button>
        {contact && onFini && (
          <button type="button" onClick={onFini} className="text-sm text-muted hover:underline">
            Annuler
          </button>
        )}
        {erreur && <span className="text-sm text-negative">{erreur}</span>}
      </div>
    </form>
  );
}
