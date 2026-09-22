-- Những gì Supabase cung cấp sẵn, dựng lại tối thiểu cho một PostgreSQL thường.
--
-- Bản dump của BepNha chỉ chứa schema `public` và `private` — đó là phần dự án sở hữu. Nhưng nó
-- tham chiếu ra ngoài: khoá ngoại trỏ tới `auth.users`, RLS policy gọi `auth.uid()`, và vài cột dùng
-- `gen_random_uuid()`. Trên Supabase những thứ đó có sẵn; trên một Postgres trắng thì không, và bản
-- phục hồi sẽ hỏng ngay ở tệp schema.
--
-- Tệp này chỉ dùng cho DIỄN TẬP phục hồi vào một database bỏ đi. Khi phục hồi thật thì đích là một
-- project Supabase mới, nơi đã có đủ những thứ này — đừng chạy tệp này ở đó.
--
-- Bảng `auth.users` ở đây cố ý chỉ có những cột mà `public` thực sự tham chiếu. Nó KHÔNG dùng để
-- nạp `auth-users.sql` vào; bản dump đó mang đầy đủ cột của Supabase và chỉ nạp được vào một project
-- Supabase thật.

create schema if not exists auth;
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_app_meta_data jsonb default '{}'::jsonb
);

-- Phiên bản rút gọn của hai hàm mà RLS policy gọi tới. Diễn tập không kiểm RLS nên chúng chỉ cần
-- tồn tại và trả về đúng kiểu.
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
