"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Exécute une écriture Supabase, affiche l'erreur éventuelle et rafraîchit la page. */
export function useEnregistrer() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  async function executer(f: () => PromiseLike<{ error: { message: string } | null }>) {
    setErreur(null);
    setOccupe(true);
    const { error } = await f();
    setOccupe(false);
    if (error) {
      setErreur(error.message);
      return false;
    }
    router.refresh();
    return true;
  }
  return { erreur, setErreur, occupe, executer };
}
