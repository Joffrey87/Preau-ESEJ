-- 03/10/2026 — Reçu de 800 € de Mme Raud (dons du 24/03 et du 04/06/2026).
--
-- Un seul reçu a été édité le 23/07/2026 et envoyé par la poste pour ces deux
-- dons ; son numéro, RE_20260324-0604, est hors numérotation automatique.
--  1. La numérotation automatique ignore désormais les numéros qui ne suivent
--     pas RE_NNNNNN_AAAAMMJJ (sans cela, le suivant serait RE_20260325…).
--  2. La date d'édition est portée par `dons.recu_emis_le` (le PDF la relit),
--     le numéro ne la contenant plus toujours.
--  3. Données : les deux dons passent sur le nouveau numéro (envoyé, édité le
--     23/07/2026) ; le 3e don (01/07/2026, 500 €) qui partageait RE_000217_20260324
--     redevient sans reçu ; ce numéro, vidé, est marqué annulé (jamais réattribué).

create or replace function public.etablir_recu(p_dons uuid[], p_date date default current_date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_attendus int := coalesce(array_length(p_dons, 1), 0);
  v_n int;
  v_annees int;
  v_deja int;
  v_sans int;
  v_total numeric;
  v_annee int;
  v_num int;
  v_code text;
begin
  if v_attendus = 0 then
    raise exception 'Aucun don sélectionné.';
  end if;
  perform pg_advisory_xact_lock(hashtext('recus_numerotation'));
  perform 1 from dons where id = any(p_dons) for update;

  select count(*),
         count(distinct extract(year from date_don)),
         count(*) filter (where recu_numero is not null and btrim(recu_numero) <> ''),
         count(*) filter (where recu_etat ilike '%pas de re%u%' or recu_etat ilike '%sans re%u%'),
         sum(montant),
         extract(year from min(date_don))::int
    into v_n, v_annees, v_deja, v_sans, v_total, v_annee
    from dons
   where id = any(p_dons) and supprime_le is null;

  if v_n <> v_attendus then raise exception 'Un des dons est introuvable ou supprimé.'; end if;
  if v_deja > 0 then raise exception 'Un des dons figure déjà sur un reçu.'; end if;
  if v_sans > 0 then raise exception 'Un des dons est marqué « Pas de reçu demandé ».'; end if;
  if v_annees > 1 then raise exception 'Un reçu ne peut couvrir que des dons d''une même année civile.'; end if;

  -- Seuls comptent les numéros au format RE_NNNNNN_… (les numéros manuels
  -- hors format ne doivent pas faire sauter la suite).
  select greatest(
           coalesce((select max(numero) from recus where numero < 1000000), 0),
           coalesce((select max(substring(recu_numero from '^RE_0*(\d+)_')::int)
                       from dons where recu_numero ~ '^RE_\d{1,7}_'), 0)
         ) + 1
    into v_num;
  v_code := 'RE_' || lpad(v_num::text, 6, '0') || '_' || to_char(p_date, 'YYYYMMDD');

  insert into recus (recu_numero, numero, annee, date_edition, total, nb_dons)
  values (v_code, v_num, v_annee, p_date, v_total, v_n);
  update dons set recu_numero = v_code, recu_emis_le = p_date where id = any(p_dons);
  return v_code;
end;
$$;

create or replace function public.annuler_recu(p_recu text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from dons where recu_numero = p_recu and recu_etat ilike 'envoy%') then
    raise exception 'Ce reçu a déjà été envoyé : il ne peut plus être annulé.';
  end if;
  update dons set recu_numero = null, recu_emis_le = null where recu_numero = p_recu;
  update recus set annule_le = now() where recu_numero = p_recu;
end;
$$;

-- Données : reçu manuel de 800 €.
insert into recus (recu_numero, numero, annee, date_edition, total, nb_dons, herite)
values ('RE_20260324-0604', 217, 2026, '2026-07-23', 800, 2, true)
on conflict (recu_numero) do nothing;

update dons
   set recu_numero = 'RE_20260324-0604',
       recu_etat = 'Envoyé - Envoi postal',
       recu_emis_le = '2026-07-23'
 where id in ('4e321100-b3af-43b1-be73-9a9b45014b82', '9cf39ca8-b43a-4d2a-b589-9e49b1e8d335')
   and recu_numero = 'RE_000217_20260324';

update dons
   set recu_numero = null
 where id = '75b2f0e3-0e1a-411c-8027-53e9a4f63770'
   and recu_numero = 'RE_000217_20260324';

update recus set annule_le = now()
 where recu_numero = 'RE_000217_20260324'
   and not exists (select 1 from dons where recu_numero = 'RE_000217_20260324' and supprime_le is null);
