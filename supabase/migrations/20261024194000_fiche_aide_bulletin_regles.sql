-- 15/10/2026 — Les règles du bulletin trimestriel quittent l'en-tête de la page Bulletins pour la fiche d'aide.
update public.fiches_aide
   set points_attention = 'Catéchisme : une appréciation seule, sans moyenne. Chaque matière a son appréciation, écrite par son professeur (ou la titulaire) ; la titulaire écrit l''appréciation du trimestre, validée par la Directrice. Les appréciations des relevés ne sont pas reprises : le bulletin a la sienne. Le bulletin porte la date de naissance de l''élève et un encart pour la signature des parents.',
       modifie_le = now()
 where titre = 'Bulletin du trimestre : appréciations' and supprime_le is null;
