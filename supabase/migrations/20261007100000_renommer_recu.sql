-- 07/10/2026 — Modifier le numéro d'un reçu fiscal.
--
-- Cas d'usage : un reçu a été envoyé au donateur sous un numéro, alors que Préau en porte un autre (numéro réattribué,
-- doublon hérité…). Le numéro réellement remis au donateur doit faire foi. Le numéro est porté par le registre `recus`,
-- par les dons du reçu et par l'historique de leurs états : tout est mis à jour d'un seul geste, et consigné.
--
-- Règles :
--  - réservé au trésorier et aux administrateurs ;
--  - le nouveau numéro commence par « RE_ » (format de la numérotation) ;
--  - il ne peut pas être celui d'un autre reçu en cours ; un numéro annulé et vide (aucun don) peut être repris, puisque
--    c'est précisément celui que le donateur a reçu ;
--  - le reçu est alors marqué « hérité » (numéro saisi à la main) : l'unicité automatique ne s'applique plus à lui.

create table if not exists public.recus_numero_historique (
  id uuid primary key default gen_random_uuid(),
  ancien text not null,
  nouveau text not null,
  change_le timestamptz not null default now(),
  par text
);
alter table public.recus_numero_historique enable row level security;
drop policy if exists recus_numero_historique_lecture on public.recus_numero_historique;
create policy recus_numero_historique_lecture on public.recus_numero_historique for select to authenticated using (public.est_bureau());

create or replace function public.renommer_recu(p_ancien text, p_nouveau text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nouveau text := btrim(coalesce(p_nouveau, ''));
  v_cible record;
  v_num int;
begin
  if not (public.est_tresorier() or public.est_admin()) then
    raise exception 'Réservé au trésorier et aux administrateurs.';
  end if;
  if v_nouveau !~ '^RE_[A-Za-z0-9_-]{1,50}$' then
    raise exception 'Le numéro doit commencer par « RE_ » (ex. RE_000207_20260311), sans espace.';
  end if;
  perform pg_advisory_xact_lock(hashtext('recus_numerotation'));
  if not exists (select 1 from recus where recu_numero = p_ancien and annule_le is null) then
    raise exception 'Reçu % introuvable ou annulé.', p_ancien;
  end if;
  if v_nouveau = p_ancien then return; end if;

  select * into v_cible from recus where recu_numero = v_nouveau;
  if found then
    if v_cible.annule_le is not null and not exists (select 1 from dons where recu_numero = v_nouveau) then
      delete from recus where recu_numero = v_nouveau; -- numéro annulé et vide : repris par le reçu réellement envoyé
    else
      raise exception 'Le numéro % est déjà celui d''un autre reçu.', v_nouveau;
    end if;
  elsif exists (select 1 from dons where recu_numero = v_nouveau) then
    raise exception 'Le numéro % est déjà porté par des dons.', v_nouveau;
  end if;

  v_num := substring(v_nouveau from '^RE_0*(\d{1,9})')::int;
  update recus set recu_numero = v_nouveau, numero = coalesce(v_num, numero), herite = true where recu_numero = p_ancien;
  update dons set recu_numero = v_nouveau where recu_numero = p_ancien;
  update dons_etat_historique set recu_numero = v_nouveau where recu_numero = p_ancien;
  insert into recus_numero_historique (ancien, nouveau, par)
  values (p_ancien, v_nouveau, coalesce(auth.jwt() ->> 'email', current_user));
end;
$$;

revoke all on function public.renommer_recu(text, text) from public, anon;
grant execute on function public.renommer_recu(text, text) to authenticated;
