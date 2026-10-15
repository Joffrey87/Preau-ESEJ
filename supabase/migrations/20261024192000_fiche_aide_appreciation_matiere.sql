-- 15/10/2026 — Bulletins : chaque matière a son appréciation (plus seulement celles des intervenants). Fiche d'aide
-- « Bulletin du trimestre : appréciations » mise à jour en conséquence.
update public.fiches_aide
   set etapes = (select jsonb_agg(case when e #>> '{}' like 'Professeur intervenant%'
                                       then to_jsonb('Chaque matière a son appréciation, face à sa moyenne : écrivez celle de vos matières (la titulaire peut les écrire toutes).'::text)
                                       else e end order by o)
                   from jsonb_array_elements(etapes) with ordinality as x(e, o)),
       modifie_le = now()
 where titre = 'Bulletin du trimestre : appréciations' and supprime_le is null;
