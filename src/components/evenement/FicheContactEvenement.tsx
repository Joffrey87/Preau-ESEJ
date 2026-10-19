"use client";

import { useState } from "react";
import type { ContactEvenement } from "@/lib/evenement";
import FormulaireContact from "./FormulaireContact";
import { ImportRibFournisseur } from "./ImportRib";

/** En-tête d'une fiche du carnet restreint : coordonnées, RIB (indication seulement), modification. */
export default function FicheContactEvenement({
  contact,
  peutModifier,
  peutImporterRib = false,
  ribEnAttente = false,
}: {
  contact: ContactEvenement;
  peutModifier: boolean;
  peutImporterRib?: boolean;
  ribEnAttente?: boolean;
}) {
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
        {/* IBAN complet : Trésorier seulement ; ici 4 derniers caractères (masqués par la base). */}
        {ligne("RIB", contact.rib_renseigne ? `Enregistré · ${contact.iban_masque ?? ""}${ribEnAttente ? " · nouvel IBAN à confirmer par le Trésorier" : ""}` : ribEnAttente ? "Nouvel IBAN à confirmer par le Trésorier" : "Non renseigné")}
      </dl>
      {peutModifier && (
        <button type="button" onClick={() => setEdition(true)} className="mt-4 text-sm font-medium text-accent hover:underline">
          Modifier
        </button>
      )}
      {peutImporterRib && <ImportRibFournisseur contact={contact} />}
    </section>
  );
}
