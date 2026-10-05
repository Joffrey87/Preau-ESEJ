"use client";

import { Field, inputCls } from "./GestionComptes";
import { composerCourrielsCouple, courrielsDuCouple, estCouple } from "@/lib/couple";

/**
 * Courriel du donateur. Pour un couple (titre « Monsieur & Madame »), deux adresses, monsieur et madame : une
 * seule suffit (le courriel est exigé tant qu'il y en a au moins une) ; elles sont enregistrées ensemble, séparées par une virgule.
 */
export default function ChampCourriel({
  titre,
  courriel,
  onChange,
  classe = "",
}: {
  titre: string;
  courriel: string;
  onChange: (v: string) => void;
  /** Classes ajoutées au premier champ (surbrillance d'un champ manquant). */
  classe?: string;
}) {
  if (!estCouple(titre)) {
    return (
      <Field label="Courriel">
        <input type="email" value={courriel} onChange={(e) => onChange(e.target.value)} className={inputCls + classe} />
      </Field>
    );
  }
  const { monsieur, madame } = courrielsDuCouple(courriel);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Courriel monsieur">
        <input type="email" value={monsieur} onChange={(e) => onChange(composerCourrielsCouple(e.target.value, madame))} className={inputCls + classe} />
      </Field>
      <Field label="Courriel madame">
        <input type="email" value={madame} onChange={(e) => onChange(composerCourrielsCouple(monsieur, e.target.value))} className={inputCls + classe} />
      </Field>
    </div>
  );
}
