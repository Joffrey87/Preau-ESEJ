-- 18/10/2026 — Prospects : email, téléphone et relation (qui a amené ce prospect). En clair pour l'instant (décision
-- du Trésorier), y compris pour les fiches chiffrées de la « Liste Axel ». Additif ; écriture : politique existante.
alter table public.prospects add column if not exists email text;
alter table public.prospects add column if not exists telephone text;
alter table public.prospects add column if not exists relation text;
