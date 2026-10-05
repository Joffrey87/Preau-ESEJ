"use client";

import { useState } from "react";
import { MEMBRES } from "@/lib/rechercheFonds";

const AUTRE = "__autre__";

/**
 * Responsable d'un prospect : liste des profils Recherche de fonds, ou « Autre » pour écrire quelqu'un à la main.
 * `onChange` est appelé avec le nom retenu (ou null pour « — »).
 */
export default function ChoixResponsable({
  value,
  onChange,
  disabled = false,
  compact = false,
  className = "",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const connu = !value || MEMBRES.includes(value);
  const [autre, setAutre] = useState(!connu);
  const [texte, setTexte] = useState(connu ? "" : (value ?? ""));
  const taille = compact ? "py-0.5 text-xs" : "py-2 text-sm";
  const base = `rounded border border-border bg-background px-1.5 ${taille}`;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <select
        value={autre ? AUTRE : (value ?? "")}
        disabled={disabled}
        aria-label="Responsable"
        onChange={(e) => {
          if (e.target.value === AUTRE) return setAutre(true);
          setAutre(false);
          setTexte("");
          onChange(e.target.value || null);
        }}
        className={base}
      >
        <option value="">—</option>
        {MEMBRES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value={AUTRE}>Autre…</option>
      </select>
      {autre && (
        <input
          type="text"
          value={texte}
          disabled={disabled}
          placeholder="Nom"
          autoFocus={!connu ? false : true}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => {
            const v = texte.trim();
            if (v !== (value ?? "")) onChange(v || null);
          }}
          className={`${base} w-28`}
        />
      )}
    </span>
  );
}
