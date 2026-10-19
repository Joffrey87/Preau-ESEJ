-- Consommation de crédit Claude (API Anthropic) par Préau : journal des lectures automatiques (factures, RIB, chèques,
-- caisses, ventes), tarifs par modèle (modifiables), taux de change USD→EUR du jour (archivé, un par jour),
-- seuil d'alerte mensuel. Lecture réservée au Webmestre (est_webmestre). Additif : nouvelles tables et fonctions.

-- Tarifs officiels par million de jetons (USD).
create table if not exists public.claude_tarifs (
  modele text primary key,
  entree_mtok numeric(10,4) not null check (entree_mtok >= 0),
  sortie_mtok numeric(10,4) not null check (sortie_mtok >= 0),
  cache_ecriture_mtok numeric(10,4) not null check (cache_ecriture_mtok >= 0),     -- écriture cache 5 min
  cache_ecriture_1h_mtok numeric(10,4) not null check (cache_ecriture_1h_mtok >= 0), -- écriture cache 1 h
  cache_lecture_mtok numeric(10,4) not null check (cache_lecture_mtok >= 0),
  source text,
  maj timestamptz not null default now()
);
alter table public.claude_tarifs enable row level security;
drop policy if exists claude_tarifs_webmestre on public.claude_tarifs;
create policy claude_tarifs_webmestre on public.claude_tarifs for select to authenticated using (public.est_webmestre());

-- Source : https://platform.claude.com/docs/en/about-claude/pricing (consultée le 19/10/2026) — Claude Sonnet 5.5 :
-- 2 $ entrée, 10 $ sortie, 2,50 $ écriture cache 5 min, 4 $ écriture cache 1 h, 0,10 $ lecture cache (par MTok).
insert into public.claude_tarifs (modele, entree_mtok, sortie_mtok, cache_ecriture_mtok, cache_ecriture_1h_mtok, cache_lecture_mtok, source)
values ('claude-sonnet-5-5', 2, 10, 2.5, 4, 0.10, 'platform.claude.com/docs/en/about-claude/pricing (19/10/2026)')
on conflict (modele) do nothing;

-- Taux de change du jour : 1 USD = taux EUR (BCE via Frankfurter), un par jour (Europe/Paris).
create table if not exists public.taux_change_usd_eur (
  jour date primary key,
  taux numeric(12,6) not null check (taux > 0.3 and taux < 3),
  date_bce date,
  source text not null default 'BCE (frankfurter.dev)',
  recupere_le timestamptz not null default now()
);
alter table public.taux_change_usd_eur enable row level security;
drop policy if exists taux_change_webmestre on public.taux_change_usd_eur;
create policy taux_change_webmestre on public.taux_change_usd_eur for select to authenticated using (public.est_webmestre());

-- Journal : une ligne par appel à l'API (réussi ou non). Pas de contenu du document, seulement les compteurs.
create table if not exists public.claude_conso (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  profil text not null,
  type_document text not null check (type_document in ('facture','rib','facture_rib','cheques','caisse','ventes','autre')),
  modele text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_ecriture_tokens integer not null default 0 check (cache_ecriture_tokens >= 0),
  cache_ecriture_1h_tokens integer not null default 0 check (cache_ecriture_1h_tokens >= 0),
  cache_lecture_tokens integer not null default 0 check (cache_lecture_tokens >= 0),
  succes boolean not null,
  cout_usd numeric(14,6),
  taux_usd_eur numeric(12,6),
  taux_jour date,
  taux_estime boolean not null default false,
  cout_eur numeric(14,6)
);
create index if not exists claude_conso_cree_le on public.claude_conso (cree_le);
alter table public.claude_conso enable row level security;
drop policy if exists claude_conso_webmestre on public.claude_conso;
create policy claude_conso_webmestre on public.claude_conso for select to authenticated using (public.est_webmestre());
-- Aucune politique d'écriture : insertion par claude_conso_enregistrer seulement.

-- Réglages : seuil d'alerte mensuel (USD).
create table if not exists public.claude_conso_reglages (
  id smallint primary key default 1 check (id = 1),
  seuil_mensuel_usd numeric(10,2) not null default 5 check (seuil_mensuel_usd >= 0),
  maj timestamptz not null default now(),
  maj_par uuid
);
insert into public.claude_conso_reglages (id) values (1) on conflict (id) do nothing;
alter table public.claude_conso_reglages enable row level security;
drop policy if exists claude_conso_reglages_webmestre on public.claude_conso_reglages;
create policy claude_conso_reglages_webmestre on public.claude_conso_reglages for select to authenticated using (public.est_webmestre());

/** Taux du jour (Europe/Paris) déjà archivé ? Le serveur ne va chercher le taux à la BCE que s'il manque. */
create or replace function public.claude_taux_du_jour_connu() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from taux_change_usd_eur where jour = (now() at time zone 'Europe/Paris')::date);
$$;
revoke execute on function public.claude_taux_du_jour_connu() from public, anon;
grant execute on function public.claude_taux_du_jour_connu() to authenticated;

/**
 * Enregistre un appel à l'API : coût USD d'après claude_tarifs, taux du jour (archivé au premier appel du jour ;
 * à défaut, dernier taux connu, marqué « estimé »), coût EUR. Réservé aux profils qui peuvent lancer une lecture.
 */
create or replace function public.claude_conso_enregistrer(
  p_type text, p_modele text,
  p_entree integer, p_sortie integer, p_cache_ecriture integer, p_cache_ecriture_1h integer, p_cache_lecture integer,
  p_succes boolean, p_taux numeric default null, p_date_bce date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_t claude_tarifs%rowtype;
  v_cout numeric;
  v_taux numeric; v_taux_jour date; v_estime boolean := false;
  b integer := 50000000; -- borne de sécurité par compteur
begin
  if auth.uid() is null then raise exception 'Non connecté' using errcode = '42501'; end if;
  if not (coalesce(public.peut_saisir_factures(), false) or coalesce(public.peut_importer_rib(), false)
          or coalesce(public.peut_deposer_cheques(), false) or coalesce(public.voit_ventes_diverses(), false)
          or public.est_webmestre()) then
    raise exception 'Non autorisé' using errcode = '42501';
  end if;
  if p_type not in ('facture','rib','facture_rib','cheques','caisse','ventes','autre') then p_type := 'autre'; end if;
  p_entree := least(greatest(coalesce(p_entree, 0), 0), b);
  p_sortie := least(greatest(coalesce(p_sortie, 0), 0), b);
  p_cache_ecriture := least(greatest(coalesce(p_cache_ecriture, 0), 0), b);
  p_cache_ecriture_1h := least(greatest(coalesce(p_cache_ecriture_1h, 0), 0), b);
  p_cache_lecture := least(greatest(coalesce(p_cache_lecture, 0), 0), b);

  -- Archive le taux du jour (premier appel du jour seulement : le taux archivé ne change plus).
  if p_taux is not null and p_taux > 0.3 and p_taux < 3 then
    insert into taux_change_usd_eur (jour, taux, date_bce) values (v_jour, round(p_taux, 6), p_date_bce)
    on conflict (jour) do nothing;
  end if;
  select taux, jour into v_taux, v_taux_jour from taux_change_usd_eur where jour = v_jour;
  if v_taux is null then
    select taux, jour into v_taux, v_taux_jour from taux_change_usd_eur order by jour desc limit 1;
    v_estime := v_taux is not null;
  end if;

  select * into v_t from claude_tarifs where modele = left(coalesce(p_modele, ''), 80);
  if found then
    v_cout := (p_entree * v_t.entree_mtok + p_sortie * v_t.sortie_mtok + p_cache_ecriture * v_t.cache_ecriture_mtok
               + p_cache_ecriture_1h * v_t.cache_ecriture_1h_mtok + p_cache_lecture * v_t.cache_lecture_mtok) / 1000000.0;
  end if;

  insert into claude_conso (user_id, profil, type_document, modele, input_tokens, output_tokens, cache_ecriture_tokens,
                            cache_ecriture_1h_tokens, cache_lecture_tokens, succes, cout_usd, taux_usd_eur, taux_jour, taux_estime, cout_eur)
  values (auth.uid(), public.mon_role_reel(), p_type, left(coalesce(p_modele, '?'), 80), p_entree, p_sortie, p_cache_ecriture,
          p_cache_ecriture_1h, p_cache_lecture, coalesce(p_succes, false), v_cout, v_taux, v_taux_jour, v_estime,
          case when v_cout is not null and v_taux is not null then v_cout * v_taux end);
end;
$$;
revoke execute on function public.claude_conso_enregistrer(text, text, integer, integer, integer, integer, integer, boolean, numeric, date) from public, anon;
grant execute on function public.claude_conso_enregistrer(text, text, integer, integer, integer, integer, integer, boolean, numeric, date) to authenticated;

/** Statistiques pour Paramètres (Webmestre seulement) : mois, année scolaire (1er sept.–31 août), total, par mois, par profil et type. */
create or replace function public.claude_conso_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_mois date := date_trunc('month', v_auj)::date;
  v_annee date := make_date(case when extract(month from v_auj) >= 9 then extract(year from v_auj)::int else extract(year from v_auj)::int - 1 end, 9, 1);
  v_seuil numeric;
  r jsonb;
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  select seuil_mensuel_usd into v_seuil from claude_conso_reglages where id = 1;
  with c as (
    select k.*, (k.cree_le at time zone 'Europe/Paris')::date as jour from claude_conso k
  )
  select jsonb_build_object(
    'seuil_usd', coalesce(v_seuil, 5),
    'debut_mois', v_mois, 'debut_annee', v_annee,
    'depuis', (select min(cree_le) from claude_conso),
    'mois', (select jsonb_build_object('nb', count(*), 'echecs', count(*) filter (where not succes), 'usd', coalesce(sum(cout_usd), 0), 'eur', coalesce(sum(cout_eur), 0)) from c where jour >= v_mois),
    'annee', (select jsonb_build_object('nb', count(*), 'echecs', count(*) filter (where not succes), 'usd', coalesce(sum(cout_usd), 0), 'eur', coalesce(sum(cout_eur), 0)) from c where jour >= v_annee),
    'total', (select jsonb_build_object('nb', count(*), 'echecs', count(*) filter (where not succes), 'usd', coalesce(sum(cout_usd), 0), 'eur', coalesce(sum(cout_eur), 0)) from c),
    'par_mois', coalesce((select jsonb_agg(m order by m->>'mois' desc) from (
        select jsonb_build_object('mois', to_char(date_trunc('month', jour), 'YYYY-MM'), 'nb', count(*), 'echecs', count(*) filter (where not succes),
                                  'usd', coalesce(sum(cout_usd), 0), 'eur', coalesce(sum(cout_eur), 0)) m
          from c group by date_trunc('month', jour)) x), '[]'::jsonb),
    'par_profil', coalesce((select jsonb_agg(p order by (p->>'usd')::numeric desc) from (
        select jsonb_build_object(
                 'profil', c.profil, 'user_id', c.user_id,
                 'nom', nullif(trim(concat_ws(' ', pr.prenom, pr.nom)), ''),
                 'nb', count(*), 'echecs', count(*) filter (where not c.succes),
                 'usd', coalesce(sum(c.cout_usd), 0), 'eur', coalesce(sum(c.cout_eur), 0),
                 'usd_mois', coalesce(sum(c.cout_usd) filter (where c.jour >= v_mois), 0),
                 'usd_annee', coalesce(sum(c.cout_usd) filter (where c.jour >= v_annee), 0),
                 'par_type', (select jsonb_agg(jsonb_build_object('type', t.type_document, 'nb', t.nb, 'usd', t.usd, 'eur', t.eur) order by t.usd desc)
                                from (select type_document, count(*) nb, coalesce(sum(cout_usd), 0) usd, coalesce(sum(cout_eur), 0) eur
                                        from claude_conso z where z.profil = c.profil and z.user_id is not distinct from c.user_id
                                       group by type_document) t)) p
          from c left join profils pr on pr.id = c.user_id
         group by c.profil, c.user_id, pr.prenom, pr.nom) y), '[]'::jsonb),
    'par_type', coalesce((select jsonb_agg(jsonb_build_object('type', type_document, 'nb', nb, 'usd', usd, 'eur', eur) order by usd desc) from (
        select type_document, count(*) nb, coalesce(sum(cout_usd), 0) usd, coalesce(sum(cout_eur), 0) eur from c group by type_document) t), '[]'::jsonb),
    'taux_jour', (select jsonb_build_object('jour', jour, 'taux', taux, 'date_bce', date_bce) from taux_change_usd_eur order by jour desc limit 1),
    'taux_estimes', (select count(*) from claude_conso where taux_estime or taux_usd_eur is null),
    'tarifs', coalesce((select jsonb_agg(to_jsonb(t) order by modele) from claude_tarifs t), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;
revoke execute on function public.claude_conso_stats() from public, anon;
grant execute on function public.claude_conso_stats() to authenticated;

/** Alerte du mois (Tableau de bord du Webmestre) : null pour tout autre compte. */
create or replace function public.claude_conso_alerte() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.est_webmestre() then (
    select jsonb_build_object('usd_mois', coalesce(sum(k.cout_usd), 0), 'seuil_usd', (select seuil_mensuel_usd from claude_conso_reglages where id = 1),
                              'depasse', coalesce(sum(k.cout_usd), 0) > (select seuil_mensuel_usd from claude_conso_reglages where id = 1))
      from claude_conso k
     where k.cree_le >= (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
  ) end;
$$;
revoke execute on function public.claude_conso_alerte() from public, anon;
grant execute on function public.claude_conso_alerte() to authenticated;

/** Seuil d'alerte mensuel (USD) : Webmestre seulement. */
create or replace function public.claude_conso_seuil_definir(p_seuil numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  if p_seuil is null or p_seuil < 0 or p_seuil > 100000 then raise exception 'Seuil invalide'; end if;
  update claude_conso_reglages set seuil_mensuel_usd = round(p_seuil, 2), maj = now(), maj_par = auth.uid() where id = 1;
end;
$$;
revoke execute on function public.claude_conso_seuil_definir(numeric) from public, anon;
grant execute on function public.claude_conso_seuil_definir(numeric) to authenticated;

/** Tarifs (USD / MTok) d'un modèle : Webmestre seulement (quand Anthropic change ses prix). */
create or replace function public.claude_tarif_definir(p_modele text, p_entree numeric, p_sortie numeric, p_cache_ecriture numeric,
                                                       p_cache_ecriture_1h numeric, p_cache_lecture numeric, p_source text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  insert into claude_tarifs (modele, entree_mtok, sortie_mtok, cache_ecriture_mtok, cache_ecriture_1h_mtok, cache_lecture_mtok, source, maj)
  values (p_modele, p_entree, p_sortie, p_cache_ecriture, p_cache_ecriture_1h, p_cache_lecture, p_source, now())
  on conflict (modele) do update set entree_mtok = excluded.entree_mtok, sortie_mtok = excluded.sortie_mtok,
    cache_ecriture_mtok = excluded.cache_ecriture_mtok, cache_ecriture_1h_mtok = excluded.cache_ecriture_1h_mtok,
    cache_lecture_mtok = excluded.cache_lecture_mtok, source = coalesce(excluded.source, claude_tarifs.source), maj = now();
end;
$$;
revoke execute on function public.claude_tarif_definir(text, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.claude_tarif_definir(text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
