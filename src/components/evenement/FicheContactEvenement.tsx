"use client";

import { useState } from "react";
import type { ContactEvenement } from "@/lib/evenement";
import FormulaireContact from "./FormulaireContact";

/** En-tête d'une fiche du carnet restreint : coordonnées, RIB (indication seulement), modification. */
export default function FicheContactEvenement({ contact, peutModifier }: { contact: ContactEvenement; peutModifier: boolean }) {
  const [edition, setEdition] = useState(false);
  if (edition) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <FormulaireContact contact={contact} onFini={() => setEdition(false)} />
      </section>
    );
  }
  const ligne = (l: string, v: string | null) => (
    <div>
      <dt className="text-xs text-muted">{l}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        {ligne("Type", contact.categories.includes("vendeur") ? "Fournisseur / prestataire" : "Contact événements")}
        {ligne("Courriel", contact.courriel)}
        {ligne("Téléphone", contact.telephone)}
        {ligne("Adresse", [contact.adresse, contact.cp_ville].filter(Boolean).join(", "))}
        {ligne("Notes", contact.notes)}
        {/* Le RIB n'est jamais montré ici : il est saisi par le Trésorier dans le Carnet d'adresses (coffre chiffré). */}
        {ligne("RIB", contact.rib_renseigne ? "Enregistré par le Trésorier (coffre)" : "À transmettre au Trésorier")}
      </dl>
      {peutModifier && (
        <button type="button" onClick={() => setEdition(true)} className="mt-4 text-sm font-medium text-accent hover:underline">
          Modifier
        </button>
      )}
    </section>
  );
}
