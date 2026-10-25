-- Bucket зображень слайдів і логотипів (openspec/changes/add-presentation-editor/design.md «Медіа»).
-- Публічне читання за URL; ліміти розміру й типів — захист у глибину поверх перевірок API.
-- Політик на storage.objects для anon/authenticated немає: RLS Supabase забороняє їм запис, зміну, видалення й перелік,
-- а серверний код працює з service role. Без схеми storage (локальний Postgres) міграція нічого не робить.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('slide-media', 'slide-media', true, 4194304, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END
$$;
