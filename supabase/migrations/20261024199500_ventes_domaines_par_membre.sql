-- Ventes diverses : domaines supplémentaires accordés à une personne (en plus de ceux de son profil).
-- Astrid Letellier (profil Événement) : côté École, comme la Directrice. Additif.
create table if not exists public.acces_domaines_ventes_personnes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  domaines text[] not null default '{}' check (domaines <@ array['ecole','evenement']::text[]),
  note text
);
alter table public.acces_domaines_ventes_personnes enable row level security;
create policy acces_domaines_ventes_personnes_lecture on public.acces_domaines_ventes_personnes for select to authenticated
  using (user_id = auth.uid() or public.est_bureau());

insert into public.acces_domaines_ventes_personnes (user_id, domaines, note)
select p.id, array['ecole'], 'Astrid Letellier : Ventes diverses côté École'
  from public.profils p where p.id = '42b7f63f-48d3-4235-9835-e54c2870dfd3'
on conflict (user_id) do nothing;

-- Le supplément personnel ne s'applique qu'à la personne elle-même (pas en vue Webmestre d'un profil).
create or replace function public.mes_domaines_ventes() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when public.mon_role() = 'tresorier' then array['ecole','evenement']
    else array(select distinct d from unnest(
           coalesce((select domaines from acces_domaines_ventes where profil = public.mon_role()), '{}')
           || case when public.ma_vue_webmestre() is null
                   then coalesce((select domaines from acces_domaines_ventes_personnes where user_id = auth.uid()), '{}')
                   else '{}'::text[] end) d order by d)
  end;
$$;
revoke execute on function public.mes_domaines_ventes() from public, anon;
grant execute on function public.mes_domaines_ventes() to authenticated;
