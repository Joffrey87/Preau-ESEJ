-- Situation : statut « mise de côté » + échéances connues (factures reçues par mail, charges récurrentes).

alter table public.factures_fournisseurs drop constraint if exists factures_fournisseurs_statut_check;
alter table public.factures_fournisseurs add constraint factures_fournisseurs_statut_check
  check (statut in ('pas_importee','recue_a_payer','payee','mise_de_cote'));

create table if not exists public.echeances_connues (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  montant numeric(12,2),
  -- Récurrente : jour du mois (1-31). Ponctuelle : date_echeance (null = sans échéance connue).
  jour_du_mois int check (jour_du_mois between 1 and 31),
  date_echeance date,
  -- Regex (insensible à la casse) sur libellé + libellé d'origine d'une dépense bancaire : paiement détecté dans le mois.
  motif_paiement text,
  statut text not null default 'a_payer' check (statut in ('a_payer','payee','mise_de_cote')),
  source text not null default 'manuel' check (source in ('manuel','mail')),
  notes text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.echeances_connues enable row level security;
create policy echeances_lecture on public.echeances_connues for select to authenticated
  using (public.mon_role() in ('president','tresorier','administrateur'));
create policy echeances_ecriture on public.echeances_connues for all to authenticated
  using (public.mon_role() in ('tresorier','administrateur'))
  with check (public.mon_role() in ('tresorier','administrateur'));

insert into public.echeances_connues (libelle, montant, jour_du_mois, motif_paiement, source, notes) values
  ('Loyer — M. et L. Immobilier', 1800, 5, 'm\. et l\. immobilier|^loyer', 'manuel', 'Loyer mensuel'),
  ('URSSAF — cotisations', 1832, 16, 'urssaf', 'manuel', 'Prélèvement mensuel (montant indicatif)'),
  ('Salaire Charlotte Dufour', 1652.46, 28, 'charlotte|dufou', 'manuel', 'Salaires versés le 28'),
  ('Salaire Faustine Clément', 1640.51, 28, 'faustine', 'manuel', 'Salaires versés le 28'),
  ('Salaire Eulalie de Fonclare', 1647.32, 28, 'eulalie|fonclare', 'manuel', 'Salaires versés le 28');
insert into public.echeances_connues (libelle, montant, statut, source, notes) values
  ('FIDEM', 264.60, 'a_payer', 'mail', 'Facture reçue dans la boîte Trésorier'),
  ('Abbaye de Signy', null, 'mise_de_cote', 'mail', 'Mise de côté (décision Président)');
