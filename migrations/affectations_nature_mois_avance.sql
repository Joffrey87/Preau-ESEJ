-- Généralisation du fléchage compta → frais de scolarité.
--
-- Jusqu'ici, une affectation reliait un don d'association à une famille.
-- Elle porte désormais une NATURE, ce qui permet d'alimenter, depuis la
-- Comptabilité, deux colonnes de l'onglet Frais de scolarité :
--   · mois_avance   : dépôt versé UNE fois par enfant, l'été précédant son
--                     entrée ; il éponge le dernier mois de sa scolarité à l'école ;
--   · frais_dossier : 60 € par enfant entrant.
-- Les natures don_association et mensualite comptent comme « réglé » pour
-- l'année scolaire de l'inscription visée ; les deux autres ne s'y ajoutent pas.

alter table public.affectations_scolarite
  add column if not exists nature text not null default 'don_association';

alter table public.affectations_scolarite
  drop constraint if exists affectations_scolarite_nature_check;
alter table public.affectations_scolarite
  add constraint affectations_scolarite_nature_check
  check (nature in ('don_association', 'mensualite', 'mois_avance', 'frais_dossier'));

create index if not exists affectations_scolarite_nature_idx
  on public.affectations_scolarite (nature);

-- Une même famille peut recevoir plusieurs affectations de natures différentes
-- depuis la même opération (ex. 210 € de dépôt + 60 € de frais de dossier).
-- L'unicité, si elle existait, portait sur (operation_id, inscription_id).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.affectations_scolarite'::regclass and contype = 'u'
  loop
    execute format('alter table public.affectations_scolarite drop constraint %I', c.conname);
  end loop;
end $$;

-- Dépôt consommé sur l'année : quand un enfant termine sa scolarité à l'école,
-- son dernier mois n'est pas dû, c'est le mois d'avance qui l'éponge.
alter table public.scolarite_inscriptions
  add column if not exists avance_consommee numeric not null default 0;

comment on column public.affectations_scolarite.nature is
  'don_association | mensualite | mois_avance | frais_dossier — nature du montant fléché vers la famille';
comment on column public.scolarite_inscriptions.avance_consommee is
  'Part du mois d''avance utilisée cette année pour le dernier mois d''un enfant qui quitte l''école';

-- Dépôt (mois d'avance) versé avant les données de la comptabilité Préau
-- (antérieur à septembre 2023) : saisi une fois, sur la première inscription
-- connue de la famille, il compte comme détenu.
alter table public.scolarite_inscriptions
  add column if not exists depot_anterieur numeric not null default 0;
comment on column public.scolarite_inscriptions.depot_anterieur is
  'Mois d''avance versé avant les données de la comptabilité (non rattachable à une écriture)';
