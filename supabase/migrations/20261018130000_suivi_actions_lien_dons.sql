-- 18/10/2026 — Suivi des actions : lien stable avec les dons du donateur.
-- Les noms des donateurs sont chiffrés (pii_chiffre) : la base ne peut pas recalculer la clé nom|prénom. L'historique
-- est donc rattaché aux identifiants des dons du donateur au moment de l'action (dons_ids) : un renommage garde ces
-- identifiants, un regroupement de fiches réunit les historiques. cible_cle reste une clé de secours.
-- Prospects : cible_cle = id du prospect (stable). Additif ; aucune entrée existante (0 ligne) à migrer.

alter table public.suivi_actions add column if not exists dons_ids uuid[] not null default '{}';
create index if not exists suivi_actions_dons_idx on public.suivi_actions using gin (dons_ids);

create or replace function public.ajouter_suivi_action(
  p_cible_type text, p_cible_cle text, p_actions text[], p_etat text, p_note text, p_auteur text, p_dons_ids uuid[]
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.peut_suivre_donateurs() then
    raise exception 'Accès refusé';
  end if;
  if coalesce(btrim(p_cible_cle), '') = '' then
    raise exception 'Donateur manquant';
  end if;
  if p_cible_type = 'prospect' and not exists (select 1 from public.prospects where id::text = p_cible_cle) then
    raise exception 'Prospect introuvable';
  end if;
  insert into public.suivi_actions (cible_type, cible_cle, actions, etat, note, auteur, dons_ids)
  values (p_cible_type, p_cible_cle, p_actions, nullif(btrim(p_etat), ''), nullif(btrim(p_note), ''),
          coalesce(nullif(btrim(p_auteur), ''), public.mon_role()),
          case when p_cible_type = 'donateur'
               then coalesce((select array_agg(id) from public.dons where id = any (coalesce(p_dons_ids, '{}'))), '{}')
               else '{}' end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ajouter_suivi_action(text, text, text[], text, text, text, uuid[]) from public, anon;
grant execute on function public.ajouter_suivi_action(text, text, text[], text, text, text, uuid[]) to authenticated;

-- L'ancienne signature (sans dons_ids) est conservée (additif) ; l'application utilise désormais celle-ci.

-- « Réservé à » : prénom Recherche de fonds, profil d'Administration (Directeur spirituel, Président, Trésorier) ou nom
-- libre (« Autre… »). Valeur libre, bornée à 80 caractères, pour les donateurs comme pour les prospects.
create or replace function public.definir_contact_reserve(p_ids uuid[], p_valeur text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.mon_role() not in ('recherche-fonds', 'resp-mecenat', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  if length(btrim(coalesce(p_valeur, ''))) > 80 then
    raise exception 'Nom trop long (80 caractères au plus)';
  end if;
  update public.dons set contact_reserve_a = nullif(btrim(p_valeur), '')
   where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.definir_reserve_prospect(p_id uuid, p_valeur text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.peut_suivre_donateurs() then
    raise exception 'Accès refusé';
  end if;
  if length(btrim(coalesce(p_valeur, ''))) > 80 then
    raise exception 'Nom trop long (80 caractères au plus)';
  end if;
  update public.prospects set reserve_a = nullif(btrim(p_valeur), '') where id = p_id;
end;
$$;
