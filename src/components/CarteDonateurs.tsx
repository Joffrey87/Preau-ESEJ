"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEurosCourt as formatEuros } from "@/lib/format";
import { REIMS, RAYON_ALENTOURS_KM, codePostal, coordonneesCp } from "@/lib/geoReims";
import type { ProfilDonateur } from "@/lib/donateurs";
import FOND from "@/lib/fondCarteReims.json";

/** Fond « paysage » : contours simplifiés des départements (IGN / Etalab), déjà projetés. */
const DEPARTEMENTS = FOND as { code: string; nom: string; d: string; x: number; y: number }[];
const TEINTES_PAYSAGE = ["#DDEBD5", "#D6E6EE", "#EEE6D2", "#E2EDDA", "#DCE7F0", "#ECE2CC"];
const OR_MARNE = "#F0D48A";

/**
 * Couleur d'une bulle : dégradé doré selon la somme des dons moyens annuels de
 * ses donateurs (échelle logarithmique : ≈ 100 €/an très pâle → ≥ 10 000 €/an or soutenu).
 */
function orSelonMontant(v: number): string {
  const r = Math.min(1, Math.max(0, Math.log10(Math.max(v, 100) / 100) / 2));
  const a = [247, 231, 190];
  const b = [150, 98, 20];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * r)).join(",")})`;
}

/**
 * Carte simplifiée des donateurs « Alentours de Reims » : dessin sans service
 * externe (Reims au centre, cercles de 50, 100 et 200 km, villes repères), une
 * bulle par commune — taille selon le nombre de donateurs, couleur selon leur
 * état. Clic sur une bulle : ses donateurs, avec leur moyenne annuelle.
 * Calculée dans le navigateur, coffre ouvert : aucune adresse ne sort de Préau.
 */

const ETATS = {
  grand: { couleur: "#7F77DD", libelle: "Grand donateur" },
  actif: { couleur: "#639922", libelle: "Actif" },
  sommeil: { couleur: "#EF9F27", libelle: "En sommeil" },
  perdu: { couleur: "#E24B4A", libelle: "Perdu" },
} as const;
// Un donateur perdu reste « perdu », même s'il a été grand donateur.
const etatDe = (p: ProfilDonateur): keyof typeof ETATS =>
  p.etat === "perdu" ? "perdu" : p.estGrand ? "grand" : p.etat === "actif" ? "actif" : "sommeil";

// Villes repères, pour se situer (aucune donnée de donateur).
const REPERES: { nom: string; lat: number; lon: number }[] = [
  { nom: "Paris", lat: 48.857, lon: 2.352 },
  { nom: "Lille", lat: 50.629, lon: 3.057 },
  { nom: "Amiens", lat: 49.894, lon: 2.296 },
  { nom: "Metz", lat: 49.119, lon: 6.176 },
  { nom: "Nancy", lat: 48.692, lon: 6.184 },
  { nom: "Troyes", lat: 48.297, lon: 4.074 },
  { nom: "Châlons", lat: 48.957, lon: 4.363 },
  { nom: "Épernay", lat: 49.04, lon: 3.959 },
  { nom: "Laon", lat: 49.564, lon: 3.62 },
  { nom: "Charleville", lat: 49.773, lon: 4.72 },
  { nom: "Auxerre", lat: 47.798, lon: 3.567 },
];

const T = 440; // côté de la carte (unités SVG)
const ECHELLE = (T / 2 - 14) / RAYON_ALENTOURS_KM; // unités par km
/** Projection simple centrée sur Reims (km est-ouest / nord-sud). */
function projeter(lat: number, lon: number) {
  const x = (lon - REIMS.lon) * 111.32 * Math.cos((REIMS.lat * Math.PI) / 180);
  const y = (lat - REIMS.lat) * 110.57;
  return { x: T / 2 + x * ECHELLE, y: T / 2 - y * ECHELLE };
}

type Lieu = {
  cle: string;
  nom: string;
  lat: number;
  lon: number;
  precis: boolean;
  communes: string[];
  donateurs: { p: ProfilDonateur; commune: string }[];
};

/** Communes plus proches que ce rayon : regroupées en une seule bulle (lisible à l'échelle de 200 km). */
const REGROUPEMENT_KM = 10;
const kmEntre = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((REIMS.lat * Math.PI) / 180), (a.lat - b.lat) * 110.57);

export default function CarteDonateurs({
  profils,
  cpVilleDe,
  onOuvrirFiche,
}: {
  profils: ProfilDonateur[];
  /** Code postal et ville du donateur (dernier renseigné). */
  cpVilleDe: (cle: string) => string | null;
  onOuvrirFiche: (cle: string) => void;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);

  // Zoom et déplacement : la fenêtre visible (viewBox carrée) ; k = facteur de zoom.
  const [vue, setVue] = useState({ x: 0, y: 0, w: T });
  const svgRef = useRef<SVGSVGElement>(null);
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const k = T / vue.w;
  const borner = (v: { x: number; y: number; w: number }) => {
    const w = Math.min(T, Math.max(T / 8, v.w));
    return { w, x: Math.min(T - w, Math.max(0, v.x)), y: Math.min(T - w, Math.max(0, v.y)) };
  };
  /** Zoom de `facteur` autour d'un point de l'écran (coordonnées client), ou du centre. */
  const zoomer = (facteur: number, client?: { x: number; y: number }) => {
    const svg = svgRef.current;
    setVue((v) => {
      const rect = svg?.getBoundingClientRect();
      const fx = rect && client ? (client.x - rect.left) / rect.width : 0.5;
      const fy = rect && client ? (client.y - rect.top) / rect.height : 0.5;
      const w = v.w / facteur;
      return borner({ w, x: v.x + (v.w - w) * fx, y: v.y + (v.w - w) * fy });
    });
  };
  // Molette (PC) : écouteur non passif pour empêcher le défilement de la page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      zoomer(e.deltaY < 0 ? 1.2 : 1 / 1.2, { x: e.clientX, y: e.clientY });
    };
    svg.addEventListener("wheel", molette, { passive: false });
    return () => svg.removeEventListener("wheel", molette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Glisser (un doigt / souris) et pincer (deux doigts).
  const surPointeur = (e: React.PointerEvent<SVGSVGElement>) => {
    const pts = pointeurs.current;
    const avant = pts.get(e.pointerId);
    if (e.type === "pointerdown") {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (e.type === "pointerup" || e.type === "pointercancel" || e.type === "pointerleave") {
      pts.delete(e.pointerId);
      return;
    }
    if (!avant) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (pts.size === 1) {
      const dx = ((e.clientX - avant.x) / rect.width) * vue.w;
      const dy = ((e.clientY - avant.y) / rect.height) * vue.w;
      if (dx || dy) setVue((v) => borner({ ...v, x: v.x - dx, y: v.y - dy }));
    } else if (pts.size === 2) {
      const autre = [...pts.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (autre) {
        const d0 = Math.hypot(avant.x - autre.x, avant.y - autre.y);
        const d1 = Math.hypot(e.clientX - autre.x, e.clientY - autre.y);
        if (d0 > 0) zoomer(d1 / d0, { x: (e.clientX + autre.x) / 2, y: (e.clientY + autre.y) / 2 });
      }
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const lieux = useMemo(() => {
    // 1. Une position par commune (code postal) ; sinon, le chef-lieu du département.
    const m = new Map<string, Lieu>();
    for (const p of profils) {
      const cpVille = cpVilleDe(p.cle);
      const cp = codePostal(cpVille);
      if (!cp) continue;
      const pos = coordonneesCp(cp);
      if (!pos) continue;
      const ville = (cpVille ?? "").replace(cp, "").trim() || cp;
      const cle = pos.precis ? cp : `dep-${cp.slice(0, 2)}`;
      const nom = pos.precis ? ville : `Département ${cp.slice(0, 2)}`;
      const l = m.get(cle) ?? { cle, nom, lat: pos.lat, lon: pos.lon, precis: pos.precis, communes: [nom], donateurs: [] };
      l.donateurs.push({ p, commune: ville });
      m.set(cle, l);
    }
    // 2. Regroupement des communes proches (ex. Reims, Tinqueux, Bétheny) : la plus
    // fournie donne son nom et attire les autres ; position = barycentre.
    const groupes: Lieu[] = [];
    for (const l of [...m.values()].sort((a, b) => b.donateurs.length - a.donateurs.length)) {
      const g = groupes.find((x) => kmEntre(x, l) <= REGROUPEMENT_KM);
      if (!g) {
        groupes.push({ ...l, communes: [...l.communes], donateurs: [...l.donateurs] });
        continue;
      }
      const n = g.donateurs.length;
      const k = l.donateurs.length;
      g.lat = (g.lat * n + l.lat * k) / (n + k);
      g.lon = (g.lon * n + l.lon * k) / (n + k);
      g.precis = g.precis && l.precis;
      g.communes.push(...l.communes);
      g.donateurs.push(...l.donateurs);
    }
    for (const g of groupes) {
      if (g.communes.length > 1) g.nom = `${g.communes[0]} et alentours`;
    }
    return groupes.sort((a, b) => b.donateurs.length - a.donateurs.length);
  }, [profils, cpVilleDe]);

  const lieu = lieux.find((l) => l.cle === choisi) ?? null;
  const moyenneAnnuelle = (p: ProfilDonateur) => p.cumul / Math.max(p.nbAnnees, 1);
  /** Somme des dons moyens annuels des donateurs de la bulle. */
  const montantLieu = (l: Lieu) => l.donateurs.reduce((t, { p }) => t + moyenneAnnuelle(p), 0);
  const rayon = (n: number) => Math.min(5 + 2.6 * Math.sqrt(n - 1), 13);
  const ORDRE_ETAT = { grand: 0, actif: 1, sommeil: 2, perdu: 3 } as const;
  const approximatifs = lieux.filter((l) => !l.precis).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="relative mx-auto w-full max-w-[560px]">
        <svg
          ref={svgRef}
          viewBox={`${vue.x} ${vue.y} ${vue.w} ${vue.w}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label="Carte des donateurs autour de Reims"
          onPointerDown={surPointeur}
          onPointerMove={surPointeur}
          onPointerUp={surPointeur}
          onPointerCancel={surPointeur}
          onPointerLeave={surPointeur}
        >
          <defs>
            <clipPath id="carte-cadre">
              <rect width={T} height={T} rx={10} />
            </clipPath>
          </defs>
          <g clipPath="url(#carte-cadre)">
            <rect width={T} height={T} fill="#EEF2F6" />
            {DEPARTEMENTS.map((dep, k) => (
              <path key={dep.code} d={dep.d} fill={dep.code === "51" ? OR_MARNE : TEINTES_PAYSAGE[k % TEINTES_PAYSAGE.length]} stroke="#ffffff" strokeWidth={1} vectorEffect="non-scaling-stroke">
                <title>{`${dep.nom} (${dep.code})`}</title>
              </path>
            ))}
            {[RAYON_ALENTOURS_KM, 100, 50].map((r) => (
              <g key={r}>
                <circle cx={T / 2} cy={T / 2} r={r * ECHELLE} fill="none" stroke="#14295c" strokeOpacity={r === RAYON_ALENTOURS_KM ? 0.35 : 0.22} strokeDasharray={r === RAYON_ALENTOURS_KM ? "0" : "3 4"} vectorEffect="non-scaling-stroke" />
                <text x={T / 2 + 3 / k} y={T / 2 - r * ECHELLE + 10 / k} fontSize={8 / k} fill="#14295c" opacity={0.55}>{r} km</text>
              </g>
            ))}
            {REPERES.map((v) => {
              const p = projeter(v.lat, v.lon);
              return (
                <g key={v.nom} opacity={0.7}>
                  <circle cx={p.x} cy={p.y} r={1.6 / k} fill="#3b4250" />
                  <text x={p.x + 4 / k} y={p.y + 3 / k} fontSize={8.5 / k} fill="#3b4250">{v.nom}</text>
                </g>
              );
            })}
          {/* Reims */}
          <g>
            <circle cx={T / 2} cy={T / 2} r={3.5 / k} fill="#14295c" />
            <text x={T / 2 + 6 / k} y={T / 2 + 3.5 / k} fontSize={10 / k} fontWeight={600} fill="#14295c">Reims</text>
          </g>
          {/* Bulles (les plus grosses dessous). */}
          {lieux.map((l) => {
            const p = projeter(l.lat, l.lon);
            const actif = l.cle === choisi;
            const montant = montantLieu(l);
            return (
              <g key={l.cle} onClick={() => setChoisi(actif ? null : l.cle)} className="cursor-pointer">
                <title>{`${l.nom} : ${l.donateurs.length} donateur${l.donateurs.length > 1 ? "s" : ""} · ≈ ${formatEuros(Math.round(montant))}/an`}</title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rayon(l.donateurs.length) / k}
                  fill={orSelonMontant(montant)}
                  fillOpacity={actif ? 1 : 0.92}
                  stroke={actif ? "#14295c" : "white"}
                  strokeWidth={actif ? 2 : 1}
                  strokeDasharray={l.precis ? "0" : "2 2"}
                  vectorEffect="non-scaling-stroke"
                />
                <text x={p.x} y={p.y + 3 / k} textAnchor="middle" fontSize={8.5 / k} fontWeight={600} fill={montant > 1500 ? "white" : "#14295c"} pointerEvents="none">
                  {l.donateurs.length}
                </text>
              </g>
            );
          })}
          </g>
        </svg>
          {/* Boutons de zoom */}
          <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white/90 text-sm text-[#14295c] shadow-sm">
            <button type="button" onClick={() => zoomer(1.5)} aria-label="Zoomer" className="px-2.5 py-1 hover:bg-black/5">+</button>
            <button type="button" onClick={() => zoomer(1 / 1.5)} aria-label="Dézoomer" className="border-t border-black/10 px-2.5 py-1 hover:bg-black/5">−</button>
            <button type="button" onClick={() => setVue({ x: 0, y: 0, w: T })} aria-label="Vue d'ensemble" title="Vue d'ensemble" className="border-t border-black/10 px-2.5 py-1 text-xs hover:bg-black/5">⟲</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>Dons moyens annuels cumulés :</span>
          {[
            [300, "< 500 €"],
            [1500, "≈ 1,5 k€"],
            [4000, "≈ 4 k€"],
            [10000, "≥ 10 k€"],
          ].map(([v, l]) => (
            <span key={l} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: orSelonMontant(v as number) }} />
              {l}
            </span>
          ))}
          <span>· taille = nombre de donateurs</span>
          {approximatifs > 0 && <span>· contour pointillé = position au chef-lieu du département</span>}
        </div>
      </div>

      {/* Détail de la bulle choisie */}
      <div className="rounded-xl border border-border bg-surface p-3 text-sm">
        {!lieu ? (
          <p className="text-muted">
            {lieux.length === 0
              ? "Aucun donateur localisé dans les 200 km (code postal manquant ?)."
              : `${lieux.reduce((s, l) => s + l.donateurs.length, 0)} donateurs dans ${lieux.length} lieu${lieux.length > 1 ? "x" : ""}. Cliquez une bulle pour voir ses donateurs.`}
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="font-semibold" title={lieu.communes.join(", ")}>{lieu.nom}</h3>
              <button type="button" onClick={() => setChoisi(null)} aria-label="Fermer" className="text-xs text-muted hover:underline">✕</button>
            </div>
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 border-b border-border pb-2 text-[11px] text-muted">
              {Object.values(ETATS).map((e) => (
                <span key={e.libelle} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.couleur }} />
                  {e.libelle}
                </span>
              ))}
            </div>
            <ul className="space-y-1">
              {[...lieu.donateurs]
                .sort((a, b) => ORDRE_ETAT[etatDe(a.p)] - ORDRE_ETAT[etatDe(b.p)] || moyenneAnnuelle(b.p) - moyenneAnnuelle(a.p))
                .map(({ p: d, commune }) => (
                  <li key={d.cle} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ETATS[etatDe(d)].couleur }} title={ETATS[etatDe(d)].libelle} />
                    <button type="button" onClick={() => onOuvrirFiche(d.cle)} className="min-w-0 flex-1 truncate text-left hover:underline">
                      {d.nom}
                      {lieu.communes.length > 1 && <span className="ml-1 text-xs text-muted">· {commune}</span>}
                    </button>
                    <span className="shrink-0 text-xs tabular-nums text-muted" title="Moyenne des dons par année de don">
                      ≈ {formatEuros(Math.round(moyenneAnnuelle(d)))}/an
                    </span>
                  </li>
                ))}
            </ul>

          </>
        )}
      </div>
    </div>
  );
}
