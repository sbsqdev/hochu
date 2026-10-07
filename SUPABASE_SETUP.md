# Turning on real accounts (Supabase)

hochu works on-device by default. To let people **sign up / log in for real** with a
cloud database of profiles, do this once (~3 minutes). You only click and copy — I already
wrote all the code.

## 1. Create a free Supabase project
- Go to **https://supabase.com** → sign in → **New project**.
- Pick a name (e.g. `hochu`), a database password (save it somewhere), a region near you.
- Wait ~1 minute for it to finish setting up.

## 2. Create the `profiles` table
Open **SQL Editor** (left sidebar) → **New query** → paste this → **Run**:

```sql
-- profile per user, linked to Supabase's built-in auth
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text unique not null,
  name       text,
  avatar     text,
  data       jsonb default '{}'::jsonb,   -- this user's wishes + sets (cross-device sync)
  created_at timestamptz default now()
);

-- Row Level Security: everyone can read profiles (for friend lookup),
-- but you can only create/edit your own.
alter table public.profiles enable row level security;

create policy "profiles readable by everyone"
  on public.profiles for select using (true);

create policy "users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update using (auth.uid() = id);
```

## 3. Let people log in instantly (optional but recommended)
By default Supabase emails a confirmation link before a new account can log in.
For now, to keep it frictionless:
- **Authentication → Providers → Email** → turn **OFF** "Confirm email" → Save.

(Leave it ON later if you want verified emails — the app handles both; it'll just say
"check your email to confirm" after signup.)

## 4. Copy your two public keys
- **Project Settings → API**
- Copy **Project URL** and the **anon public** key.

## 5. Paste them into the app
Open **`supabase.js`** and replace the two placeholders:

```js
window.SUPA = {
  url:  "https://YOURID.supabase.co",   // ← Project URL
  anon: "eyJhbGciOi...long key...",     // ← anon public key
};
```

> ✅ The **anon** key is meant to be public and is safe in the browser — it's guarded by the
> RLS rules above. **Never** put the `service_role` key here.

## 6. Ship it
```bash
git add -A
git commit -m "Enable Supabase auth + profiles"
git push
```
Vercel auto-redeploys. Now sign-ups create real accounts in your database, and a profile
shows up in **Table Editor → profiles**.

### Already have the table from before?
If you created `profiles` earlier (without the `data` column), just run this once to add it:

```sql
alter table public.profiles add column if not exists data jsonb default '{}'::jsonb;
```

---

**Cross-device sync:** once the keys are in `supabase.js`, each account's wishes **and** sets
are saved to its profile's `data` column and reload on any device you log in from. In on-device
mode (no keys) everything stays local to that browser, as before.
