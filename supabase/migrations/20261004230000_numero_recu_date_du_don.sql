-- 04/10/2026 — Le suffixe du numéro de reçu (RE_000NNN_AAAAMMJJ) est la date du premier don
-- couvert, et non la date d'édition (qui est enregistrée à part : dons.recu_emis_le, recus.date_edition).
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
  v_premier date;
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
         extract(year from min(date_don))::int,
         min(date_don)
    into v_n, v_annees, v_deja, v_sans, v_total, v_annee, v_premier
    from dons
   where id = any(p_dons) and supprime_le is null;

  if v_n <> v_attendus then raise exception 'Un des dons est introuvable ou supprimé.'; end if;
  if v_deja > 0 then raise exception 'Un des dons figure déjà sur un reçu.'; end if;
  if v_sans > 0 then raise exception 'Un des dons est marqué « Pas de reçu demandé ».'; end if;
  if v_annees > 1 then raise exception 'Un reçu ne peut couvrir que des dons d''une même année civile.'; end if;

  select greatest(
           coalesce((select max(numero) from recus where numero < 1000000), 0),
           coalesce((select max(substring(recu_numero from '^RE_0*(\d+)_')::int)
                       from dons where recu_numero ~ '^RE_\d{1,7}_'), 0)
         ) + 1
    into v_num;
  v_code := 'RE_' || lpad(v_num::text, 6, '0') || '_' || to_char(v_premier, 'YYYYMMDD');

  insert into recus (recu_numero, numero, annee, date_edition, total, nb_dons)
  values (v_code, v_num, v_annee, p_date, v_total, v_n);
  update dons set recu_numero = v_code, recu_emis_le = p_date where id = any(p_dons);
  return v_code;
end;
$$;
