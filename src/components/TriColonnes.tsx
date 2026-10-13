"use client";

import { useState } from "react";

/** Tri des tableaux : ordre français, vides toujours en dernier ; tri stable (l'ordre d'origine départage). */
export type SensTri = "asc" | "desc";
export type Tri<C extends string> = { col: C; dir: SensTri } | null;

const COLLATOR = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function trierListe<T, C extends string>(liste: T[], tri: Tri<C>, val: (x: T, col: C) => string | number | null | undefined): T[] {
  if (!tri) return liste;
  const sens = tri.dir === "asc" ? 1 : -1;
  return [...liste].sort((a, b) => {
    const va = val(a, tri.col);
    const vb = val(b, tri.col);
    const videA = va == null || va === "";
    const videB = vb == null || vb === "";
    if (videA || videB) return videA && videB ? 0 : videA ? 1 : -1;
    return sens * (typeof va === "number" && typeof vb === "number" ? va - vb : COLLATOR.compare(String(va), String(vb)));
  });
}

/**
 * État de tri + en-têtes cliquables. `decroissantsDabord` : colonnes (dates, montants) dont le premier clic trie
 * du plus grand au plus récent.
 */
export function useTri<C extends string>(defaut: Tri<C>, decroissantsDabord: C[] = []) {
  const [tri, setTri] = useState<Tri<C>>(defaut);
  const trier = (col: C) =>
    setTri((t) => (t?.col === col ? { col, dir: t.dir === "asc" ? "desc" : "asc" } : { col, dir: decroissantsDabord.includes(col) ? "desc" : "asc" }));
  const fleche = (col: C) => (
    <span className={tri?.col === col ? "text-accent" : "opacity-30"} aria-hidden>
      {tri?.col === col ? (tri.dir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );
  const bouton = (col: C, label: string, titre?: string) => (
    <button type="button" onClick={() => trier(col)} className="inline-flex items-center gap-0.5 hover:text-foreground" title={titre ?? `Trier par ${label.toLowerCase()}`}>
      {label}
      {fleche(col)}
    </button>
  );
  const ariaSort = (...cols: C[]): "ascending" | "descending" | "none" =>
    tri && cols.includes(tri.col) ? (tri.dir === "asc" ? "ascending" : "descending") : "none";
  return { tri, trier, bouton, ariaSort };
}
