"use client";

import { useCarnet } from "@/components/CarnetProvider";
import SecuriteCoffre from "@/components/SecuriteCoffre";

export default function SecuriteCarnet() {
  return (
    <SecuriteCoffre
      coffre={useCarnet()}
      titre="Sécurité du carnet d'adresses"
      description="Chiffre les coordonnées du carnet (nom, adresse, courriel, téléphone, IBAN) avec une phrase commune aux membres du bureau — distincte de celle du coffre des dons."
      perte="Si la phrase commune et le code de secours sont perdus tous les deux, les coordonnées du carnet seront définitivement illisibles."
      placeholderPhrase="Phrase commune du bureau (8 caractères min.)"
    />
  );
}
