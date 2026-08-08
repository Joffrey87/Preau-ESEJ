"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, formatEuros } from "@/lib/format";
import {
  CATEGORIE_LABEL,
  CATEGORIE_STYLE,
  type Mail,
  type CategorieMail,
} from "@/lib/mails";

export default function BoiteMails({ mails }: { mails: Mail[] }) {
  const [locaux, setLocaux] = useState<Mail[]>(mails);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState<"" | CategorieMail>("");
  const [voirTraites, setVoirTraites] = useState(false);

  const filtres = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return locaux.filter(
      (m) =>
        (voirTraites || !m.traite) &&
        (!fCat || m.categorie === fCat) &&
        (!ql ||
          m.objet.toLowerCase().includes(ql) ||
          m.expediteur.toLowerCase().includes(ql) ||
          m.email.toLowerCase().includes(ql)),
    );
  }, [locaux, q, fCat, voirTraites]);

  const aTraiter = locaux.filter((m) => !m.traite).length;
  const facturesImpayees = locaux.filter((m) => m.facture_statut === "impayee" && !m.traite);
  const donsATraiter = locaux.filter((m) => m.categorie === "don" && !m.traite).length;

  const toggleTraite = (id: string) =>
    setLocaux((ls) => ls.map((m) => (m.id === id ? { ...m, traite: !m.traite } : m)));

  return (
    <div className="space-y-5">
      {/* Bandeau : Gmail non connecté */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3">
        <div className="text-sm">
          <span className="font-medium text-gold">Aperçu — Gmail non connecté.</span>{" "}
          <span className="text-muted">
            Ces mails sont des exemples. Le tri par catégorie et la détection de factures sont réels
            et fonctionneront sur ta vraie boîte une fois Gmail relié.
          </span>
        </div>
        <button
          type="button"
          disabled
          title="Étape de connexion à venir (guide fourni)"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted opacity-70"
        >
          Connecter Gmail
        </button>
      </div>

      {/* Tuiles */}
      <div className="grid grid-cols-3 gap-3">
        <Tuile label="À traiter" valeur={String(aTraiter)} />
        <Tuile label="Factures impayées" valeur={String(facturesImpayees.length)} accent={facturesImpayees.length ? "negative" : "muted"} />
        <Tuile label="Dons à traiter" valeur={String(donsATraiter)} accent={donsATraiter ? "gold" : "muted"} />
      </div>

      {/* Factures impayées repérées — recoupées avec la compta */}
      {facturesImpayees.length > 0 && (
        <div className="rounded-xl border border-negative/30 bg-negative/5 p-4">
          <p className="text-sm font-medium text-negative">
            {facturesImpayees.length} facture(s) sans paiement trouvé dans la comptabilité
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Recoupement mail ↔ compta (montant + date). À vérifier puis ajouter dans « En cours » → À régler.
          </p>
        </div>
      )}

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (objet, expéditeur)…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select value={fCat} onChange={(e) => setFCat(e.target.value as "" | CategorieMail)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Toutes catégories</option>
          {Object.entries(CATEGORIE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={voirTraites} onChange={(e) => setVoirTraites(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Voir les traités
        </label>
      </div>

      {/* Liste des mails */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {filtres.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">Aucun mail à afficher.</p>
        ) : (
          filtres.map((m) => (
            <div key={m.id} className={`border-b border-border p-4 last:border-0 ${m.traite ? "opacity-55" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.expediteur}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEGORIE_STYLE[m.categorie]}`}>
                      {CATEGORIE_LABEL[m.categorie]}
                    </span>
                    {m.facture_statut === "impayee" && (
                      <span className="rounded bg-negative/10 px-1.5 py-0.5 text-[11px] font-medium text-negative">impayée</span>
                    )}
                    {m.facture_statut === "payee" && (
                      <span className="rounded bg-positive/10 px-1.5 py-0.5 text-[11px] font-medium text-positive">payée ✓</span>
                    )}
                    {m.piece_jointe && <span className="text-xs text-muted" title="Pièce jointe">📎</span>}
                  </div>
                  <div className="mt-0.5 truncate text-sm">{m.objet}</div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted">{m.extrait}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-muted">{formatDate(m.date)}</div>
                  {m.montant != null && (
                    <div className="mt-0.5 text-sm font-medium tabular-nums">{formatEuros(m.montant)}</div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {m.categorie === "facture" && m.facture_statut === "impayee" && (
                  <Link href="/en-cours" className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:opacity-90">
                    Ajouter à « En cours »
                  </Link>
                )}
                {m.categorie === "don" && (
                  <Link href="/dons" className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-2">
                    Enregistrer le don
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => toggleTraite(m.id)}
                  className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-surface-2"
                >
                  {m.traite ? "Rouvrir" : "Marquer traité"}
                </button>
                <button type="button" disabled title="Disponible une fois Gmail connecté" className="rounded-lg border border-border px-3 py-1 text-xs text-muted opacity-60">
                  Étiqueter
                </button>
                <button type="button" disabled title="Disponible une fois Gmail connecté" className="rounded-lg border border-border px-3 py-1 text-xs text-muted opacity-60">
                  Classer dans un dossier
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "negative" | "gold" | "muted" }) {
  const col = accent === "negative" ? "text-negative" : accent === "gold" ? "text-gold" : accent === "muted" ? "text-muted" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}
