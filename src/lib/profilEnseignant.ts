// Profil enseignant (Mon profil) : coordonnées et signature pour les PDF.
// Les images vivent dans le bucket privé « signatures-enseignants » ; le chemin est stocké sur enseignants.signature_path.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SIGNATURES_ENSEIGNANTS_BUCKET = "signatures-enseignants";

export type ProfilEnseignant = {
  id: string;
  civilite: string | null;
  prenom: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  signature_path: string | null;
};

/** Télécharge la signature d'un enseignant (ArrayBuffer) pour l'embarquer dans un PDF. */
export async function telechargerSignatureEnseignant(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<ArrayBuffer | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SIGNATURES_ENSEIGNANTS_BUCKET).download(path);
  if (error || !data) {
    console.error("Signature enseignant introuvable :", path, error?.message);
    return null;
  }
  return data.arrayBuffer();
}

/** Nom de fichier dans le bucket pour cet enseignant (extension selon le type MIME). */
export function cheminSignatureEnseignant(enseignantId: string, mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  return `${enseignantId}.${ext}`;
}
