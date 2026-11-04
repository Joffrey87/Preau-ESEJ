-- Performance : dans les règles d'accès, les fonctions de droits sans argument (mon_role(), est_bureau(), ma_famille()…)
-- étaient recalculées à CHAQUE ligne lue. Écrites « (select fonction()) », elles sont calculées une seule fois par
-- requête. Le résultat ne dépend que du compte connecté et ne change pas au cours d'une requête : qui voit quoi reste
-- identique. Les fonctions qui reçoivent une colonne (enseigne_dans(classe_id)…) ne sont pas concernées.
--
-- Migration ré-exécutable : un appel déjà écrit « (select …) » est laissé tel quel.
-- Retour arrière : supabase/annulations/20261104231420_rls_droits_calcules_une_fois_annuler.sql.

do $$
declare
  motif constant text :=
    '(?<!SELECT )(?<![\w.])((?:public\.)?(?:acces_bulletins|est_admin|est_bureau|est_directrice|est_evenement'
    '|est_responsable_evenement|est_tresorier|est_tresorier_factures|est_tresorier_strict|est_webmestre|gere_scolarite'
    '|ma_famille|mes_domaines_ventes|mon_enseignant|mon_role|peut_deposer_cheques|peut_rechercher|peut_voir_pipeline'
    '|peut_voir_sensible|valide_familles|voit_evenements|voit_ventes_diverses|auth\.uid)\(\))';
  p record;
  q text;
  w text;
  clauses text;
  restants int;
begin
  perform set_config('lock_timeout', '5s', true);
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(p.qual, motif, '(select \1)', 'g');
    w := regexp_replace(p.with_check, motif, '(select \1)', 'g');
    if q is not distinct from p.qual and w is not distinct from p.with_check then continue; end if;
    clauses := concat_ws(' ', case when q is not null then format('using (%s)', q) end,
                              case when w is not null then format('with check (%s)', w) end);
    execute format('alter policy %I on public.%I %s', p.policyname, p.tablename, clauses);
  end loop;

  -- Contrôle : plus aucun appel non protégé.
  select count(*) into restants from pg_policies
   where schemaname = 'public' and (qual ~ motif or with_check ~ motif);
  if restants > 0 then raise exception 'Règles d''accès : % règle(s) encore à recalcul par ligne', restants; end if;
end $$;
