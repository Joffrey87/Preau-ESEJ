// Aperçu hors navigateur du reçu fiscal PDF : écrit un fichier de test.
// Usage : npx tsx scripts/apercu-recu.mts [sortie.pdf]
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Les ressources sont servies depuis /public en production ; ici on les lit sur disque.
const racine = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
globalThis.fetch = (async (url: string) => {
  const octets = await readFile(join(racine, url));
  return { ok: true, arrayBuffer: async () => octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) };
}) as unknown as typeof fetch;

const { construireRecuPdf } = await import("../src/lib/recuPdf");

const pdf = await construireRecuPdf(
  {
    recu_numero: "RE_000228_20260604",
    donateur_titre: "Madame",
    donateur_nom: "Le Bourgeois",
    donateur_prenom: "Sylvie",
    raison_sociale: null,
    est_personne_morale: false,
    adresse: "53 Rue Voltaire",
    cp_ville: "92300 Levallois-Perret",
    montant: 500,
    date_don: "2026-06-04",
    mode_paiement: "virement",
  },
  { dateEdition: "2026-07-06" },
);

const sortie = process.argv[2] ?? "apercu-recu.pdf";
await writeFile(sortie, pdf);
console.log(`Écrit : ${sortie} (${pdf.byteLength} octets)`);
