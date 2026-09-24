create table if not exists modele_recu (
  id smallint primary key default 1 check (id = 1),
  president_nom text,
  tresorier_nom text,
  adresse_rue text,
  adresse_cp_ville text,
  courriel_contact text,
  signature_president_path text,
  signature_tresorier_path text,
  updated_at timestamptz not null default now()
);

alter table modele_recu enable row level security;

drop policy if exists modele_recu_lecture on modele_recu;
drop policy if exists modele_recu_ecriture on modele_recu;
create policy modele_recu_lecture on modele_recu for select to authenticated using (true);
create policy modele_recu_ecriture on modele_recu for all to authenticated
  using (public.est_tresorier()) with check (public.est_tresorier());

insert into modele_recu (id, president_nom, tresorier_nom, adresse_rue, adresse_cp_ville, courriel_contact)
values (1, 'Jean-François ANTONA', 'Joffrey Lenoble', '71 avenue Jean Jaurès', '51100 Reims', 'ecole@saint-enfant-jesus.fr')
on conflict (id) do nothing;

drop policy if exists modeles_auth_all on storage.objects;
drop policy if exists modeles_lecture on storage.objects;
drop policy if exists modeles_ecriture on storage.objects;
create policy modeles_lecture on storage.objects for select to authenticated
  using (bucket_id = 'modeles');
create policy modeles_ecriture on storage.objects for all to authenticated
  using (bucket_id = 'modeles' and public.est_tresorier())
  with check (bucket_id = 'modeles' and public.est_tresorier());

update dons set categorie_donateur = 'Entreprise' where categorie_donateur in ('Professionnel', 'Société');

notify pgrst, 'reload schema';
