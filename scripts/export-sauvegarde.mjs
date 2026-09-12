#!/usr/bin/env node
/**
 * Sauvegarde indépendante de la plateforme.
 *
 * Exporte toutes les tables en CSV + JSON dans un dossier daté, HORS du dépôt.
 * À lancer une fois par mois, et à copier ensuite sur un second support.
 *
 *   node scripts/export-sauvegarde.mjs "C:/2019/ARIL/Sauvegardes"
 *
 * Nécessite dans .env.local :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (clé de service — ne jamais la versionner)
 *
 * Note : les colonnes chiffrées (pii_chiffre) sont exportées TELLES QUELLES,
 * donc illisibles sans le coffre. C'est voulu : la sauvegarde ne doit pas être
 * un contournement du chiffrement. Conservez la phrase et le code de secours
 * ailleurs que dans ce dossier.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TABLES = [
  "exercices", "comptes", "categories", "operations", "budget_lignes",
  "organisation", "dons", "contacts", "prospects", "echeances",
  "scolarite_bareme", "scolarite_inscriptions", "taches", "evenements",
  "financements", "correspondances", "coffre",
];

// --- Lecture de .env.local -------------------------------------------------
function lireEnv() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const ligne of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...lireEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const cle = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !cle) {
  console.error(
    "Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.\n" +
      "La clé de service se trouve dans Supabase → Project Settings → API.",
  );
  process.exit(1);
}

const destination = process.argv[2] ?? join(process.cwd(), "..", "Sauvegardes");
const horodatage = new Date().toISOString().slice(0, 10);
const dossier = join(destination, `esej-${horodatage}`);
mkdirSync(dossier, { recursive: true });

const supabase = createClient(url, cle, { auth: { persistSession: false } });

/** Échappement CSV : guillemets doublés, champ encadré si nécessaire. */
function cellule(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function versCsv(lignes) {
  if (lignes.length === 0) return "";
  const colonnes = [...new Set(lignes.flatMap((l) => Object.keys(l)))];
  const entete = colonnes.join(";");
  const corps = lignes.map((l) => colonnes.map((c) => cellule(l[c])).join(";"));
  return [entete, ...corps].join("\r\n");
}

/** Pagination : PostgREST plafonne à 1000 lignes par requête. */
async function toutLire(table) {
  const taille = 1000;
  let debut = 0;
  const tout = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(debut, debut + taille - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    tout.push(...(data ?? []));
    if ((data ?? []).length < taille) break;
    debut += taille;
  }
  return tout;
}

const resume = [];
let echecs = 0;

for (const table of TABLES) {
  try {
    const lignes = await toutLire(table);
    writeFileSync(join(dossier, `${table}.csv`), "\uFEFF" + versCsv(lignes), "utf8");
    writeFileSync(join(dossier, `${table}.json`), JSON.stringify(lignes, null, 2), "utf8");
    resume.push({ table, lignes: lignes.length });
    console.log(`  ${table.padEnd(24)} ${String(lignes.length).padStart(6)} ligne(s)`);
  } catch (e) {
    echecs++;
    resume.push({ table, erreur: String(e.message ?? e) });
    console.error(`  ${table.padEnd(24)} ÉCHEC : ${e.message ?? e}`);
  }
}

writeFileSync(
  join(dossier, "_resume.json"),
  JSON.stringify({ date: new Date().toISOString(), projet: url, tables: resume }, null, 2),
  "utf8",
);

console.log(`\nSauvegarde écrite dans : ${dossier}`);
if (echecs > 0) {
  console.error(`${echecs} table(s) en échec — sauvegarde INCOMPLÈTE.`);
  process.exit(1);
}
console.log("Pensez à copier ce dossier sur un second support (disque externe, autre machine).");
