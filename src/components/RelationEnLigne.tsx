"use client";

import { useState } from "react";
import { inputCls } from "./GestionComptes";

/** Relation modifiable en ligne : clic → champ ; Entrée ou sortie du champ enregistre, Échap annule. */
export default function RelationEnLigne({
  valeur,
  modifiable,
  onEnregistrer,
  liste,
  nom,
}: {
  valeur: string | null;
  modifiable: boolean;
  /** Renvoie un message d'erreur, ou null si c'est enregistré. */
  onEnregistrer: (v: string | null) => Promise<string | null>;
  liste?: string;
  nom: string;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ t: "enregistrement" | "erreur"; m?: string } | null>(null);
  const affiche = valeur?.trim() || "—";
  if (!modifiable) return <>{affiche}</>;
  async function valider(v: string) {
    const propre = v.trim();
    if (propre === (valeur ?? "").trim()) return setEdit(null);
    setEtat({ t: "enregistrement" });
    const err = await onEnregistrer(propre || null);
    if (err) return setEtat({ t: "erreur", m: err });
    setEtat(null);
    setEdit(null);
  }
  return (
    <>
      {edit !== null ? (
        <input
          autoFocus
          type="text"
          list={liste}
          value={edit}
          disabled={etat?.t === "enregistrement"}
          onChange={(e) => setEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setEtat(null);
              setEdit(null);
            }
          }}
          onBlur={(e) => void valider(e.currentTarget.value)}
          aria-label={`Relation : ${nom}`}
          className={`${inputCls} min-w-32 py-1 text-sm`}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEtat(null);
            setEdit(valeur ?? "");
          }}
          title="Modifier la relation"
          className="-mx-1 rounded px-1 text-left hover:bg-surface-2"
        >
          {affiche}
        </button>
      )}
      {etat && <div className={`text-xs ${etat.t === "erreur" ? "text-negative" : "text-muted"}`}>{etat.t === "erreur" ? `Erreur : ${etat.m}` : "Enregistrement…"}</div>}
    </>
  );
}
