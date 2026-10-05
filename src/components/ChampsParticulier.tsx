"use client";

import { Field, inputCls } from "./GestionComptes";
import { TITRE_COUPLE, composerPrenomsCouple, estCouple, prenomsDuCouple } from "@/lib/couple";

type Cle = "donateur_titre" | "donateur_prenom" | "donateur_nom";

/**
 * Titre, prénom et nom d'un particulier, avec l'option « Couple » : un titre « Monsieur & Madame »
 * et deux prénoms, pour un reçu au nom de « Monsieur & Madame François et Cécile Croison ».
 */
export default function ChampsParticulier({
  titre,
  prenom,
  nom,
  set,
  classeNom = "",
  nomAvantPrenom = false,
}: {
  titre: string;
  prenom: string;
  nom: string;
  set: (k: Cle, v: string) => void;
  /** Classes ajoutées au champ « Nom » (surbrillance d'un champ manquant). */
  classeNom?: string;
  /** Ordre historique de certains formulaires : Titre, Nom, Prénom. */
  nomAvantPrenom?: boolean;
}) {
  const couple = estCouple(titre);
  const { monsieur, madame } = prenomsDuCouple(prenom);

  function basculer(actif: boolean) {
    if (actif) {
      set("donateur_titre", TITRE_COUPLE);
      set("donateur_prenom", composerPrenomsCouple(prenom, ""));
    } else {
      set("donateur_titre", "Monsieur");
      set("donateur_prenom", monsieur);
    }
  }

  const champNom = (
    <Field label="Nom">
      <input type="text" required value={nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls + classeNom} />
    </Field>
  );

  return (
    <>
      {couple ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Prénom monsieur">
            <input
              type="text"
              value={monsieur}
              onChange={(e) => set("donateur_prenom", composerPrenomsCouple(e.target.value, madame))}
              className={inputCls}
              placeholder="François"
            />
          </Field>
          <Field label="Prénom madame">
            <input
              type="text"
              value={madame}
              onChange={(e) => set("donateur_prenom", composerPrenomsCouple(monsieur, e.target.value))}
              className={inputCls}
              placeholder="Cécile"
            />
          </Field>
          {champNom}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Titre">
            <input type="text" value={titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
          </Field>
          {nomAvantPrenom && champNom}
          <Field label="Prénom">
            <input type="text" value={prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
          </Field>
          {!nomAvantPrenom && champNom}
        </div>
      )}
      <label className="-mt-1 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={couple} onChange={(e) => basculer(e.target.checked)} />
        Couple (« {TITRE_COUPLE} ») : un prénom pour monsieur, un pour madame
        {couple && (
          <span className="text-foreground">
            → {TITRE_COUPLE} {composerPrenomsCouple(monsieur, madame) || "…"} {nom}
          </span>
        )}
      </label>
    </>
  );
}
