-- Webmestre : domaines (École, Événement, les deux) visibles par profil dans Ventes diverses et Caisses.
-- Additif : nouvelle table ; défauts identiques au comportement actuel (Directrice = École, Événement = Événement,
-- Trésorier = tout). Soldes des deux caisses lisibles par tout profil ayant un domaine (Caisse totale).

create table if not exists public.acces_domaines_ventes (
  profil text primary key,
  domaines text[] not null default '{}' check (domaines <@ array['ecole','evenement']::text[])
);
alter table public.acces_domaines_ventes enable row level security;
create policy acces_domaines_ventes_lecture on public.acces_domaines_ventes for select to authenticated
  using (public.est_bureau() or public.est_evenement());

insert into public.acces_domaines_ventes (profil, domaines) values
  ('directrice', array['ecole']),
  ('evenement', array['evenement'])
on conflict (profil) do nothing;

create or replace function public.mes_domaines_ventes() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when public.mon_role() = 'tresorier' then array['ecole','evenement']
    else coalesce((select domaines from acces_domaines_ventes where profil = public.mon_role()), '{}')
  end;
$$;
revoke execute on function public.mes_domaines_ventes() from public, anon;
grant execute on function public.mes_domaines_ventes() to authenticated;

create or replace function public.domaine_ventes_ok(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_domaine = any(public.mes_domaines_ventes());
$$;

create or replace function public.voit_ventes_diverses() returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(public.mes_domaines_ventes()) > 0;
$$;

create or replace function public.acces_domaines_definir(p_profil text, p_domaines text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_ancien text[];
begin
  perform public.acces_verifier_webmestre();
  if p_profil = 'tresorier' then raise exception 'Le Trésorier voit toujours les deux domaines.'; end if;
  select domaines into v_ancien from acces_domaines_ventes where profil = p_profil;
  insert into acces_domaines_ventes (profil, domaines) values (p_profil, coalesce(p_domaines, '{}'))
    on conflict (profil) do update set domaines = excluded.domaines;
  perform public.acces_journal('domaines ventes', p_profil, '/ventes-diverses',
    array_to_string(coalesce(v_ancien, '{}'), ','), array_to_string(coalesce(p_domaines, '{}'), ','), null);
end $$;
revoke execute on function public.acces_domaines_definir(text, text[]) from public, anon;
grant execute on function public.acces_domaines_definir(text, text[]) to authenticated;

-- Caisse totale : soldes des deux caisses (sans le détail) pour tout profil ayant un domaine.
create or replace function public.caisses_soldes() returns table (cle text, nom text, solde numeric)
language sql stable security definer set search_path = public as $$
  select c.cle, c.nom, c.solde_initial + coalesce((select sum(m.montant) from caisse_mouvements m where m.caisse_id = c.id), 0)
    from caisses c
   where public.voit_ventes_diverses()
   order by c.cle;
$$;
revoke execute on function public.caisses_soldes() from public, anon;
grant execute on function public.caisses_soldes() to authenticated;
