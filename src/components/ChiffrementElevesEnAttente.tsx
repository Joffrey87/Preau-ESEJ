"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCarnet } from "@/components/CarnetProvider";

type EnAttente = {
  id: string;
  famille_id: string;
  prenom: string;
  classe_entree: string;
  annee_entree: string;
  decalage: number;
};

/**
 * Dès que le coffre du carnet est ouvert, chiffre les élèves déposés en
 * attente (prénom en clair, saisi hors du navigateur) et les range dans
 * `eleves`, puis efface la ligne d'attente. Sans affichage : l'opération est
 * silencieuse et ne se produit qu'une fois par ouverture du coffre.
 */
export default function ChiffrementElevesEnAttente() {
  const router = useRouter();
  const { estOuvert, chiffrer } = useCarnet();
  const enCours = useRef(false);

  useEffect(() => {
    if (!estOuvert || enCours.current) return;
    enCours.current = true;
    (async () => {
      const supabase = createClient();
      // Sans droit sur la scolarité, la lecture revient simplement vide.
      const { data } = await supabase.from("eleves_a_chiffrer").select("id, famille_id, prenom, classe_entree, annee_entree, decalage");
      const lignes = (data ?? []) as EnAttente[];
      let ranges = 0;
      for (const l of lignes) {
        const prenom = l.prenom.trim();
        const { error } = await supabase.from("eleves").insert({
          famille_id: l.famille_id,
          prenom_chiffre: await chiffrer(prenom),
          initiale: prenom.charAt(0).toUpperCase(),
          classe_entree: l.classe_entree,
          annee_entree: l.annee_entree,
          decalage: l.decalage ?? 0,
        });
        // Le prénom en clair n'est effacé qu'une fois l'élève chiffré bien enregistré.
        if (error) continue;
        await supabase.from("eleves_a_chiffrer").delete().eq("id", l.id);
        ranges++;
      }
      if (ranges > 0) router.refresh();
    })().finally(() => {
      enCours.current = false;
    });
  }, [estOuvert, chiffrer, router]);

  return null;
}
