-- Базова схема «закрито за замовчуванням» (openspec/specs/instance-deployment/spec.md «Базова схема закрита за замовчуванням», openspec/changes/bootstrap-platform/design.md D5).
-- Ролі anon/authenticated (Supabase API з anon-ключем) не мають прямого доступу до public:
-- ні до наявних об'єктів, ні до тих, що створять наступні міграції (роль міграцій — postgres).
-- Перевірка наявності ролей дозволяє застосувати міграцію й на «чистому» Postgres для локальної розробки.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    END IF;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  END IF;
END
$$;
--> statement-breakpoint
INSERT INTO "instance_meta" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
