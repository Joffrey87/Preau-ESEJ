-- 15/10/2026 — « Dépôt de chèques » s'appelle « Dépôt en banque » sur tous les profils ; retiré de la Directrice.
update public.acces_pages set libelle = 'Dépôt en banque' where cle = '/cheques';
update public.acces_profils set niveau = 'masque' where page = '/cheques' and profil = 'directrice';
