-- QR codes de paiement (IBAN SumUp, IBAN Crédit Mutuel) : déposés par le Trésorier dans ses Paramètres, affichés en
-- lien dans l'onglet Ventes diverses. Compartiment privé ; objets « sumup » et « credit-mutuel ».
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-codes', 'qr-codes', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Lecture : profils qui voient les Ventes diverses (Trésorier, Directrice, Événement).
create policy qr_codes_lecture on storage.objects for select to authenticated
  using (bucket_id = 'qr-codes' and public.voit_ventes_diverses());
-- Dépôt, remplacement, retrait : Trésorier seulement.
create policy qr_codes_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'qr-codes' and public.est_tresorier_strict() and name in ('sumup', 'credit-mutuel'));
create policy qr_codes_modification on storage.objects for update to authenticated
  using (bucket_id = 'qr-codes' and public.est_tresorier_strict())
  with check (bucket_id = 'qr-codes' and public.est_tresorier_strict() and name in ('sumup', 'credit-mutuel'));
create policy qr_codes_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'qr-codes' and public.est_tresorier_strict());
