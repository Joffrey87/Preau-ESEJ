-- Onglet « Dons » de la Recherche de fonds (lecture seule) : demandes de reçu fiscal au Trésorier,
-- modification des seules infos de contact du donateur (relation, courriel, téléphone) avec alerte au Trésorier.
-- Strictement additif.

alter table public.dons add column if not exists telephone text;

-- Demande de reçu fiscal (une par don ; supprimée si la demande est annulée).
create table if not exists public.dons_demandes_recu (
  don_id uuid primary key references public.dons(id) on delete cascade,
  demande_par text,
  demande_role text,
  demande_user uuid default auth.uid(),
  demande_le timestamptz not null default now()
);
alter table public.dons_demandes_recu enable row level security;
drop policy if exists dons_demandes_recu_lecture on public.dons_demandes_recu;
create policy dons_demandes_recu_lecture on public.dons_demandes_recu for select to authenticated
  using (public.est_tresorier() or public.mon_role() in ('recherche-fonds', 'president'));
grant select on public.dons_demandes_recu to authenticated;

-- Alertes « infos donateur modifiées » (vues par le Trésorier sur la ligne du don).
create table if not exists public.dons_alertes_donateur (
  id uuid primary key default gen_random_uuid(),
  don_id uuid not null references public.dons(id) on delete cascade,
  changements jsonb not null default '[]'::jsonb,
  par text,
  par_role text,
  le timestamptz not null default now(),
  vu_le timestamptz,
  vu_par text
);
create index if not exists dons_alertes_donateur_don_idx on public.dons_alertes_donateur (don_id) where vu_le is null;
alter table public.dons_alertes_donateur enable row level security;
drop policy if exists dons_alertes_donateur_lecture on public.dons_alertes_donateur;
create policy dons_alertes_donateur_lecture on public.dons_alertes_donateur for select to authenticated
  using (public.est_tresorier());
grant select on public.dons_alertes_donateur to authenticated;

-- Bascule la demande de reçu d'un don : crée la demande, ou l'annule si elle existe. Renvoie true si demandée.
create or replace function public.dons_basculer_demande_recu(p_don uuid, p_prenom text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_role text := public.mon_role();
begin
  if v_role not in ('recherche-fonds', 'tresorier', 'president') then
    raise exception 'Profil non autorisé à demander un reçu fiscal.';
  end if;
  if not exists (select 1 from dons where id = p_don and supprime_le is null and not coalesce(don_boursier, false)) then
    raise exception 'Don introuvable.';
  end if;
  if exists (select 1 from dons_demandes_recu where don_id = p_don) then
    delete from dons_demandes_recu where don_id = p_don;
    return false;
  end if;
  insert into dons_demandes_recu (don_id, demande_par, demande_role)
  values (p_don, nullif(btrim(coalesce(p_prenom, '')), ''), v_role);
  return true;
end;
$$;

-- Modifie les seules infos de contact d'un donateur (tous ses dons) et consigne une alerte pour le Trésorier.
--  p_courriel_clair : courriel pour les dons non chiffrés ; p_pii_chiffre : fiche rechiffrée (courriel modifié)
--  pour les dons chiffrés (le navigateur ne change que le courriel). p_changements : [{champ, avant, apres}].
create or replace function public.dons_modifier_contact_donateur(
  p_dons uuid[], p_origine text, p_telephone text, p_courriel_clair text, p_pii_chiffre text,
  p_changements jsonb, p_prenom text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_role text := public.mon_role();
begin
  if v_role not in ('recherche-fonds', 'tresorier', 'president') then
    raise exception 'Profil non autorisé.';
  end if;
  if coalesce(array_length(p_dons, 1), 0) = 0 then raise exception 'Aucun don.'; end if;
  update dons set
    origine = nullif(btrim(coalesce(p_origine, '')), ''),
    telephone = nullif(btrim(coalesce(p_telephone, '')), ''),
    courriel = case when pii_chiffre is null then nullif(btrim(coalesce(p_courriel_clair, '')), '') else courriel end,
    pii_chiffre = case when pii_chiffre is not null and p_pii_chiffre is not null then p_pii_chiffre else pii_chiffre end
  where id = any(p_dons) and supprime_le is null;
  if v_role <> 'tresorier' and jsonb_array_length(coalesce(p_changements, '[]'::jsonb)) > 0 then
    insert into dons_alertes_donateur (don_id, changements, par, par_role)
    select id, p_changements, nullif(btrim(coalesce(p_prenom, '')), ''), v_role
    from dons where id = any(p_dons) and supprime_le is null;
  end if;
end;
$$;

-- Le Trésorier marque les alertes d'un don comme vues.
create or replace function public.dons_alertes_vues(p_don uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.est_tresorier() then raise exception 'Réservé au Trésorier.'; end if;
  update dons_alertes_donateur set vu_le = now(), vu_par = public.mon_role() where don_id = p_don and vu_le is null;
end;
$$;

revoke all on function public.dons_basculer_demande_recu(uuid, text) from public, anon;
revoke all on function public.dons_modifier_contact_donateur(uuid[], text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.dons_alertes_vues(uuid) from public, anon;
grant execute on function public.dons_basculer_demande_recu(uuid, text) to authenticated;
grant execute on function public.dons_modifier_contact_donateur(uuid[], text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.dons_alertes_vues(uuid) to authenticated;

-- Webmestre : nouvel onglet dans la grille des droits.
insert into public.acces_pages (cle, libelle, section, ordre) values
  ('/recherche/dons', 'Dons (Recherche de fonds)', 'Recherche de fonds', 62)
on conflict (cle) do nothing;

insert into public.acces_profils (profil, page, niveau)
select r.profil, '/recherche/dons',
  case when r.profil = 'tresorier' then 'modification'
       when r.profil in ('recherche-fonds', 'president') then 'lecture'
       else 'masque' end
from (values ('president'),('tresorier'),('secretaire'),('administrateur'),('directrice'),('directeur-spirituel'),('resp-mecenat'),('recherche-fonds')) r(profil)
on conflict (profil, page) do nothing;

insert into public.acces_historique (auteur, action, detail)
values ('système', 'catalogue', 'Ajout de l''onglet Dons (Recherche de fonds) ; Recherche de fonds et Président en lecture');
