-- 18/10/2026 — Relations donateurs : historique des actions de suivi (donateur ou prospect).
-- Une entrée = une ou plusieurs actions + état éventuel après l'action + une note, signée (prénom Recherche de fonds ou rôle).
-- Additif. Lecture : qui voit les Relations donateurs ; écriture par RPC (Recherche de fonds, Trésorier, Administrateur).

create table if not exists public.suivi_actions (
  id uuid primary key default gen_random_uuid(),
  cible_type text not null check (cible_type in ('donateur', 'prospect')),
  cible_cle text not null, -- donateur : clé du donateur (cleDonateur) ; prospect : id du prospect
  actions text[] not null check (
    cardinality(actions) > 0 and actions <@ array[
      'Courrier envoyé', 'Email envoyé', 'Appel téléphonique', 'Rencontre en personne',
      'Invitation à un événement', 'Remerciement envoyé', 'Relance à faire', 'Pas de réponse'
    ]::text[]
  ),
  etat text check (etat is null or etat in (
    'À contacter', 'Contacté', 'En réflexion', 'Promesse de don', 'Don reçu', 'À relancer', 'Refus', 'Ne plus solliciter'
  )),
  note text,
  auteur text not null,
  cree_le timestamptz not null default now()
);
create index if not exists suivi_actions_cible_idx on public.suivi_actions (cible_type, cible_cle, cree_le desc);

alter table public.suivi_actions enable row level security;
drop policy if exists suivi_actions_lecture on public.suivi_actions;
create policy suivi_actions_lecture on public.suivi_actions for select to authenticated
  using (public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel');
revoke insert, update, delete on public.suivi_actions from anon, authenticated;

create or replace function public.peut_suivre_donateurs()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('recherche-fonds', 'tresorier', 'administrateur');
$$;
revoke all on function public.peut_suivre_donateurs() from public, anon;
grant execute on function public.peut_suivre_donateurs() to authenticated;

-- p_auteur : prénom choisi par le profil partagé Recherche de fonds (ou prénom/rôle du Trésorier) ; à défaut, le rôle.
create or replace function public.ajouter_suivi_action(
  p_cible_type text, p_cible_cle text, p_actions text[], p_etat text, p_note text, p_auteur text
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
  insert into public.suivi_actions (cible_type, cible_cle, actions, etat, note, auteur)
  values (p_cible_type, p_cible_cle, p_actions, nullif(btrim(p_etat), ''), nullif(btrim(p_note), ''),
          coalesce(nullif(btrim(p_auteur), ''), public.mon_role()))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ajouter_suivi_action(text, text, text[], text, text, text) from public, anon;
grant execute on function public.ajouter_suivi_action(text, text, text[], text, text, text) to authenticated;

-- Réservation d'un prospect à un profil (les donateurs ont déjà dons.contact_reserve_a).
alter table public.prospects add column if not exists reserve_a text;
create or replace function public.definir_reserve_prospect(p_id uuid, p_valeur text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.peut_suivre_donateurs() then
    raise exception 'Accès refusé';
  end if;
  update public.prospects set reserve_a = nullif(btrim(p_valeur), '') where id = p_id;
end;
$$;
revoke all on function public.definir_reserve_prospect(uuid, text) from public, anon;
grant execute on function public.definir_reserve_prospect(uuid, text) to authenticated;
