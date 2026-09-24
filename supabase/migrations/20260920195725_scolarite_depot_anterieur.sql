-- Dépôt (mois d'avance) versé avant les données de la comptabilité Préau
-- (antérieur à septembre 2023) : saisi une fois, sur la première inscription
-- connue de la famille, il compte comme détenu.
alter table public.scolarite_inscriptions
  add column if not exists depot_anterieur numeric not null default 0;
comment on column public.scolarite_inscriptions.depot_anterieur is
  'Mois d''avance versé avant les données de la comptabilité (non rattachable à une écriture)';
