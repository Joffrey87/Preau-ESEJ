"use client";

// Démo publique (sans connexion, aucune écriture en base) de l'état « après import » du dépôt de chèques.
import { useState } from "react";
import ChequesCompacts, { type LigneCompacte } from "@/components/ChequesCompacts";
import { formatEuros, todayISO } from "@/lib/format";

const TOTAL_BORDEREAU = 195;
// Démo hors connexion : copie des catégories de recette de la Comptabilité (en vrai, lues dans la table categories).
const CATEGORIES = [
  "Don", "Frais de scolarité : Mensualités", "Ventes diverses",
  "Rentes vie de l'école (passif en achat fournitures)", "Rentes périscolaire", "Don d'Association",
  "Frais de scolarité : Dossier", "Frais de scolarité : Mois d'avance", "Remboursement IJSS",
].map((nom) => ({ id: nom, nom }));
const montantDe = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;

export default function DemoCheques() {
  const [lignes, setLignes] = useState<LigneCompacte[]>([
    { emetteur: "Martin Claire", montant: "45,00", date_cheque: "2026-10-02", categorie_id: "Don", doute: false },
    { emetteur: "Durand Paul", montant: "120,00", date_cheque: "2026-10-05", categorie_id: "Don", doute: false },
    { emetteur: "Lefebvre Sophie", montant: "30,00", date_cheque: "2026-10-08", categorie_id: "Don", doute: false },
  ]);
  const total = Math.round(lignes.reduce((s, l) => s + montantDe(l.montant), 0) * 100) / 100;
  const ok = Math.abs(total - TOTAL_BORDEREAU) < 0.005;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-5 py-8">
      <p className="rounded-lg border-2 border-gold bg-gold-soft px-3 py-2 text-sm font-semibold text-foreground" role="status">
        Données fictives — démonstration du dépôt de chèques. Rien n&apos;est enregistré.
      </p>
      <h1 className="text-xl font-semibold">Dépôt en banque</h1>
      <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Nouvelle remise de chèques</h2>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-sm">
          <a href="/demo/bordereau-demo.jpg" target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/bordereau-demo.jpg" alt="Bordereau de remise fictif" className="h-16 w-24 rounded object-cover" />
          </a>
          <span className="min-w-0 flex-1 truncate">bordereau-demo.jpg · lu automatiquement : 3 chèques</span>
        </div>
        <p className={`rounded-lg px-3 py-2 text-sm ${ok ? "bg-surface-2 text-positive" : "bg-gold-soft text-foreground"}`} role="status">
          {ok
            ? `Total du bordereau ${formatEuros(TOTAL_BORDEREAU)} : la somme des chèques correspond.`
            : `⚠ Total du bordereau ${formatEuros(TOTAL_BORDEREAU)}, mais la somme des chèques est ${formatEuros(total)}. Vérifiez les montants.`}
        </p>
        <div className="text-xs text-muted">
          Date de la remise <span className="text-sm text-foreground">Aujourd&apos;hui · {todayISO().split("-").reverse().join("/")}</span>
        </div>
        <ChequesCompacts lignes={lignes} categories={CATEGORIES} onChange={(i, p) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))} />
        <div className="flex items-center justify-between">
          <button type="button" disabled className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg opacity-50">
            Enregistrer la remise (démo)
          </button>
          <p className="text-sm">
            Total : <span className="font-semibold tabular-nums">{formatEuros(total)}</span>
          </p>
        </div>
      </section>
    </div>
  );
}
