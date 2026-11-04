-- Retour arrière de la migration 20261104231420_rls_droits_calcules_une_fois.sql (à exécuter à la main si besoin).
-- Remet « fonction() » à la place de « (select fonction()) » dans les règles d'accès ; les droits restent identiques.

do $$
declare
  motif constant text :=
    '\(\s*SELECT\s+((?:public\.)?(?:acces_bulletins|est_admin|est_bureau|est_directrice|est_evenement'
    '|est_responsable_evenement|est_tresorier|est_tresorier_factures|est_tresorier_strict|est_webmestre|gere_scolarite'
    '|ma_famille|mes_domaines_ventes|mon_enseignant|mon_role|peut_deposer_cheques|peut_rechercher|peut_voir_pipeline'
    '|peut_voir_sensible|valide_familles|voit_evenements|voit_ventes_diverses|auth\.uid)\(\))\s+AS\s+\w+\)';
  p record;
  q text;
  w text;
  clauses text;
begin
  perform set_config('lock_timeout', '5s', true);
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(p.qual, motif, '\1', 'g');
    w := regexp_replace(p.with_check, motif, '\1', 'g');
    if q is not distinct from p.qual and w is not distinct from p.with_check then continue; end if;
    clauses := concat_ws(' ', case when q is not null then format('using (%s)', q) end,
                              case when w is not null then format('with check (%s)', w) end);
    execute format('alter policy %I on public.%I %s', p.policyname, p.tablename, clauses);
  end loop;
end $$;
