alter table public.affectations_scolarite
  add column if not exists nature text not null default 'don_association';
alter table public.affectations_scolarite
  drop constraint if exists affectations_scolarite_nature_check;
alter table public.affectations_scolarite
  add constraint affectations_scolarite_nature_check
  check (nature in ('don_association', 'mensualite', 'mois_avance', 'frais_dossier'));
create index if not exists affectations_scolarite_nature_idx
  on public.affectations_scolarite (nature);
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
alter table public.scolarite_inscriptions
  add column if not exists avance_consommee numeric not null default 0;
comment on column public.affectations_scolarite.nature is
  'don_association | mensualite | mois_avance | frais_dossier — nature du montant fléché vers la famille';
comment on column public.scolarite_inscriptions.avance_consommee is
  'Part du mois d''avance utilisée cette année pour le dernier mois d''un enfant qui quitte l''école';
-- l'affectation Boucher existante porte désormais sur une opération de scolarité
update public.affectations_scolarite a set nature='mensualite'
from public.operations o join public.categories c on c.id=o.categorie_id
where o.id=a.operation_id and c.nom='Paiement frais de scolarité' and a.nature='don_association';
