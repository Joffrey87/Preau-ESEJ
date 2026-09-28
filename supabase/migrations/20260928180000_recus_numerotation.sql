-- Reçus fiscaux : numérotation automatique et registre des reçus émis.
--
-- Règles (trésorier, 28/09/2026) :
--  - un reçu = un numéro unique RE_000NNN_AAAAMMJJ (suffixe = date d'édition),
--    attribué dans l'ordre et jamais réutilisé ;
--  - chaque don figure sur un seul reçu ; un reçu ne couvre qu'une année civile ;
--  - en principe un reçu par donateur et par an ; un reçu intermédiaire (ou un
--    reçu par don) couvre les dons sans reçu à sa date, le suivant repart de là.
--
-- `recus` garde la trace de chaque reçu émis. Les numéros saisis à la main
-- avant cette migration y sont repris (herite = true) ; certains existent en
-- double (RE_000171, RE_000175) : l'unicité ne s'impose qu'aux nouveaux.

create table if not exists public.recus (
  recu_numero text primary key,
  numero integer not null,
  annee integer not null,
  date_edition date not null,
  total numeric not null,
  nb_dons integer not null,
  herite boolean not null default false,
  annule_le timestamptz,
  cree_le timestamptz not null default now(),
  cree_par uuid default auth.uid()
);
create unique index if not exists recus_numero_unique on public.recus(numero) where not herite;

alter table public.recus enable row level security;
drop policy if exists recus_auth_all on public.recus;
create policy recus_auth_all on public.recus for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.recus to authenticated, service_role;

-- Reprise des reçus existants.
insert into public.recus (recu_numero, numero, annee, date_edition, total, nb_dons, herite)
select d.recu_numero,
       substring(d.recu_numero from '^RE_0*(\d+)')::int,
       extract(year from min(d.date_don))::int,
       coalesce(
         case when d.recu_numero ~ '_\d{8}$'
              then to_date(right(d.recu_numero, 8), 'YYYYMMDD') end,
         max(d.date_don)),
       sum(d.montant),
       count(*),
       true
from public.dons d
where d.recu_numero ~ '^RE_\d+' and d.supprime_le is null
group by d.recu_numero
on conflict (recu_numero) do nothing;

-- Établit un reçu pour un ensemble de dons (même donateur, vérifié côté
-- navigateur puisque les noms sont chiffrés) : numéro suivant, date d'édition,
-- inscription sur les dons. Tout ou rien, sous verrou pour que deux reçus ne
-- prennent jamais le même numéro.
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

  select greatest(
           coalesce((select max(numero) from recus), 0),
           coalesce((select max(substring(recu_numero from '^RE_0*(\d+)')::int)
                       from dons where recu_numero ~ '^RE_\d+'), 0)
         ) + 1
    into v_num;
  v_code := 'RE_' || lpad(v_num::text, 6, '0') || '_' || to_char(p_date, 'YYYYMMDD');

  insert into recus (recu_numero, numero, annee, date_edition, total, nb_dons)
  values (v_code, v_num, v_annee, p_date, v_total, v_n);
  update dons set recu_numero = v_code where id = any(p_dons);
  return v_code;
end;
$$;

-- Annule un reçu non envoyé (erreur de saisie) : les dons redeviennent sans
-- reçu, le numéro reste consommé (jamais réattribué).
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
  update dons set recu_numero = null where recu_numero = p_recu;
  update recus set annule_le = now() where recu_numero = p_recu;
end;
$$;

grant execute on function public.etablir_recu(uuid[], date) to authenticated;
grant execute on function public.annuler_recu(text) to authenticated;

comment on table public.recus is 'Registre des reçus fiscaux émis (numérotation automatique, un numéro par reçu).';
