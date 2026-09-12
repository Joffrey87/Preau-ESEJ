"use client";

import { useCoffre } from "@/components/CoffreProvider";
import SecuriteCoffre from "@/components/SecuriteCoffre";

export default function SecuriteDonnees() {
  return (
    <SecuriteCoffre
      coffre={useCoffre()}
      titre="Sécurité des données donateurs"
      description="Chiffre les informations personnelles des donateurs (nom, adresse…) avec une phrase secrète que vous seul connaissez. Sans elle, la base ne contient que des données illisibles."
      perte="Si vous perdez à la fois la phrase et le code de secours, les données donateurs seront définitivement illisibles — personne ne pourra les récupérer."
    />
  );
}
