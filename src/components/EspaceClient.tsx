"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { telechargerAttestation, type Attestation } from "@/lib/attestationPdf";
import type { Association } from "@/lib/espaceFamille";

/** Déconnexion depuis l'espace famille. */
export function Deconnexion() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
    >
      Se déconnecter
    </button>
  );
}

/** Attestation de paiement d'un versement, éditée dans le navigateur. */
export function BoutonAttestation({ attestation, association }: { attestation: Attestation; association: Association }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await telechargerAttestation(attestation, {
            adresseRue: association?.adresse_rue ?? "6 rue du Colonel Charbonneaux",
            adresseCpVille: association?.adresse_cp_ville ?? "51100 Reims",
            tresorierNom: association?.tresorier_nom ?? "Le trésorier",
            courrielContact: association?.courriel_contact ?? "ecole@saint-enfant-jesus.fr",
          });
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs text-accent hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "Attestation"}
    </button>
  );
}
