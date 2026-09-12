-- Onglet Comptabilité → Correspondances.
-- Règles de réécriture des libellés bancaires, éditables par le trésorier.
-- Objectif de passation : les règles vivent en base, plus dans le code.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase.

create table if not exists correspondances (
  id             uuid primary key default gen_random_uuid(),
  ordre          integer not null default 100,
  actif          boolean not null default true,
  -- Reconnaissance
  motif          text    not null,
  mode           text    not null default 'contient'
                 check (mode in ('contient', 'commence', 'regex')),
  type_operation text    check (type_operation in ('recette', 'depense')),
  montant_min    numeric,
  montant_max    numeric,
  -- Effets
  libelle_modele text,          -- jetons : {mois} {annee} {montant} {origine} {1} {2}…
  categorie_id   uuid references categories(id) on delete set null,
  alerte         text    check (alerte in ('ambre', 'rouge')),
  alerte_message text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists correspondances_ordre_idx on correspondances (ordre);

alter table correspondances enable row level security;

drop policy if exists correspondances_auth_all on correspondances;
create policy correspondances_auth_all on correspondances
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Amorce : les règles décrites par le trésorier. Toutes modifiables ensuite
-- depuis l'interface.
-- ---------------------------------------------------------------------------
insert into correspondances (ordre, motif, mode, type_operation, montant_min, montant_max, libelle_modele, categorie_id, alerte, alerte_message, notes)
select v.ordre, v.motif, v.mode, v.type_operation, v.montant_min, v.montant_max, v.libelle_modele,
       (select id from categories c where c.nom = v.categorie limit 1),
       v.alerte, v.alerte_message, v.notes
from (values
  -- Paies : un nom qui revient chaque mois, en dépense, dans la fourchette de paie.
  (10, 'vergnaut',  'contient', 'depense', 1000::numeric, 2500::numeric,
       'Paie {mois} Mlle Clémence Vergnaut', 'Frais de personnel : Salaires', null, null,
       'N''enseigne plus depuis 2026-2027 ; règle conservée pour l''historique de paie.'),
  (12, 'dufou',     'contient', 'depense', 1000::numeric, 2500::numeric,
       'Paie {mois} Mme Charlotte Dufour', 'Frais de personnel : Salaires', null, null,
       'Le nom est Dufour ; la banque le tronque en « DUFOU », d''où le motif.'),
  (13, 'fonclare',  'contient', 'depense', 1000::numeric, 2500::numeric,
       'Paie {mois} Mlle Eulalie de Fonclare de Riols', 'Frais de personnel : Salaires', null, null,
       'Nom complet : Eulalie de Fonclare de Riols.'),
  (14, 'guibert',   'contient', 'depense', 1000::numeric, 2500::numeric,
       'Paie {mois} Mme Blandine de Guibert', 'Frais de personnel : Salaires', null, null,
       'Enseignante à compter de 2026-2027, en remplacement de Clémence Vergnaut.'),

  -- Dons : « Don Nom Prénom », le nom étant capturé après le mot-clé.
  (20, 'don\s+(?:de\s+)?(.+)$', 'regex', 'recette', null, null,
       'Don {1}', 'Don', null, null,
       'Capture ce qui suit « don » dans le libellé bancaire.'),

  -- Stripe : quasi toujours une vente, rarement un don → vérification demandée.
  (30, 'stripe', 'contient', 'recette', null, null,
       'Encaissement Stripe — {mois} {annee}', 'Ventes diverses au profit de l''école', 'ambre',
       'Stripe est presque toujours une vente. Vérifier s''il s''agit d''un don, et rattacher l''événement concerné.',
       'Rattachement à un événement : à venir.'),

  -- Remises de chèques : don ou vente, jamais tranché automatiquement.
  (40, 'rem chq', 'contient', 'recette', null, null,
       'Remise de chèque — {mois} {annee}', null, 'ambre',
       'Remise de chèque : déterminer s''il s''agit d''un don ou d''une vente au profit de l''école.',
       'Le numéro de chèque et la référence sont retirés par la normalisation.'),

  -- Encaissements d'espèces : le plus souvent des ventes au profit de l'école.
  (45, 'vrst', 'commence', 'recette', null, null,
       'Encaissement en espèces — {mois} {annee}', 'Ventes diverses au profit de l''école', 'ambre',
       'Espèces : le plus souvent une vente au profit de l''école. Vérifier s''il s''agit d''un don ou d''une quête.',
       'Libellé bancaire de la forme « VRST REF******* ».'),

  -- Amitié Sainte Anne : des dons, souvent à ventiler entre plusieurs familles.
  (15, 'amitie sainte anne', 'contient', 'recette', null, null,
       'Don Amitié Sainte Anne — {mois} {annee}', 'Don d''Association', 'ambre',
       'ASA : don d''association. Une part peut être affectée aux frais de scolarité d''une famille lors de la ventilation.',
       'Écriture typiquement à scinder.'),

  -- HelloAsso : des dons, très souvent à scinder entre plusieurs donateurs.
  (16, 'helloasso', 'contient', 'recette', null, null,
       'Don HelloAsso — {mois} {annee}', 'Don', 'ambre',
       'HelloAsso : versement groupé, très souvent à scinder entre plusieurs donateurs.',
       'Écriture typiquement à scinder.'),

  -- Frais bancaires : commissions et factures de tenue de compte.
  (50, 'fact sgt', 'contient', 'depense', null, null,
       'Frais bancaires — {mois} {annee}', 'Frais bancaires', null, null,
       'Facture de commissions bancaires (avec TVA).'),
  (51, 'f comm intervention', 'contient', 'depense', null, null,
       'Commission d''intervention — {mois} {annee}', 'Frais bancaires', null, null, null),

  -- Frais de scolarité : le libellé mentionne explicitement la scolarité.
  (55, 'scolarit', 'contient', 'recette', null, null,
       'Frais de scolarité — {origine}', 'Paiement frais de scolarité', 'ambre',
       'Rattacher à la famille concernée (carnet d''adresses), et préciser s''il s''agit d''un mois d''avance.',
       'Le rapprochement automatique avec le carnet reste à faire.'),

  -- Retraite ALPRO : classée deux fois différemment dans l'historique.
  (57, 'alpro', 'contient', 'depense', null, null,
       'Cotisation retraite ALPRO — {mois} {annee}', 'Protection sociale', null, null,
       'Historique incohérent : à trancher (B2V ou catégorie retraite dédiée).'),

  -- Assurance GENERALI : distincte de FIDES, mais classée avec elle jusqu'ici.
  (58, 'generali', 'contient', 'depense', null, null,
       'Cotisation FIDES Generali — {mois} {annee}', 'Assurance', 'ambre',
       'Contrat GENERALI porté par le courtier FIDES : vérifier le rattachement.',
       null),

  -- Prélèvement à la source : catégorie dédiée existante.
  (59, 'dgfip|impot-pas|prelevement a la source', 'regex', 'depense', null, null,
       'Prélèvement à la source — {mois} {annee}', 'Frais de personnel : Prélèvement à la source', null, null,
       'Historique : certaines écritures étaient classées en « Salaires ».'),

  -- Charges récurrentes sans ambiguïté.
  (60, 'free',   'contient', 'depense', null, null, 'Frais internet — {mois} {annee}', 'Frais internet', null, null, null),
  -- Le modèle remplace tout le libellé : « Champagne Ardennes » n'y figure pas.
  (61, 'urssaf', 'contient', 'depense', null, null, 'URSSAF — {mois} {annee}', 'Frais de personnel : URSSAF', null, null, null),
  (62, 'fides',  'contient', 'depense', null, null, 'Cotisation FIDES Generali',        'Assurance',        null, null, null),
  (63, 'fidem',  'contient', 'depense', null, null, 'Frais de gestion FIDEM',           'Frais de gestion',           null, null, null),
  (64, 'b2v',    'contient', 'depense', null, null, 'Prévoyance B2V',                   'Protection sociale',     null, null, null),
  (65, 'helium', 'contient', 'depense', null, null, 'Mutuelle Helium',                  'Mutuelle',         null, null, null)
) as v(ordre, motif, mode, type_operation, montant_min, montant_max, libelle_modele, categorie, alerte, alerte_message, notes)
where not exists (select 1 from correspondances);

-- Contrôle
select ordre, motif, mode, libelle_modele, alerte from correspondances order by ordre;
