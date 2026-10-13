"use client";

import Link from "next/link";
import { useState } from "react";
import { nomContact, type ContactEvenement } from "@/lib/evenement";
import FormulaireContact from "./FormulaireContact";

export default function CarnetEvenement({ peutModifier, contacts }: { peutModifier: boolean; contacts: ContactEvenement[] }) {
  const [ajout, setAjout] = useState(false);
  const [filtre, setFiltre] = useState("");
  const liste = contacts.filter((c) => nomContact(c).toLowerCase().includes(filtre.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Rechercher…"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {peutModifier && (
          <button type="button" onClick={() => setAjout((a) => !a)} className="text-sm font-medium text-accent hover:underline">
            {ajout ? "Fermer" : "+ Ajouter un contact"}
          </button>
        )}
      </div>
      {ajout && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <FormulaireContact onFini={() => setAjout(false)} />
        </section>
      )}
      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Courriel</th>
              <th className="px-4 py-2">Téléphone</th>
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Aucun contact.
                </td>
              </tr>
            )}
            {liste.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link href={`/evenement/carnet/${c.id}`} className="font-medium text-accent hover:underline">
                    {nomContact(c)}
                  </Link>
                </td>
                <td className="px-4 py-2">{c.categories.includes("vendeur") ? "Fournisseur" : "Contact événements"}</td>
                <td className="px-4 py-2 text-muted">{c.courriel ?? "—"}</td>
                <td className="px-4 py-2 text-muted">{c.telephone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
