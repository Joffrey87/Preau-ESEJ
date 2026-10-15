-- 15/10/2026 — La classe « Classe d'Eulalie » s'appelle désormais « CE1 / CE2 / CM1 » : les bulletins déjà publiés, dont
-- la synthèse avait figé l'ancien nom, prennent le nom actuel de leur classe (le nom de la titulaire n'est pas touché).
update public.bulletins b
   set synthese = jsonb_set(b.synthese, '{classe,nom}', to_jsonb(c.nom))
  from public.classes c
 where c.id = b.classe_id and b.synthese->'classe'->>'nom' = 'Classe d''Eulalie';
