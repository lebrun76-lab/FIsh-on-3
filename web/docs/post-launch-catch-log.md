# Post-launch catch log (scope only)

Status: scoping. No feature code yet. Agreed: no public feed at launch. After launch, a private catch log with photos. The "How'd it go?" follow-up is an **option only**. Alex hasn't approved it.

## What the prototype already has

- `/catch-log` page (`src/app/catch-log/page.tsx`) renders `src/components/CatchLog.tsx`.
- Free users see a `Locked` card: "Catch log is a Pro feature".
- Pro users see a stub "+ Log a catch" button that does nothing, plus two hard-coded sample rows (species, size, spot, time, conditions).
- The forecast page links Pro users to it ("Log a catch here", `ForecastView.tsx`).
- The `catch_log` table already exists in `supabase/migrations/20261025000000_forecasts.sql`:
  - `user_id`, `spot_id`, `caught_at`, `species`, `length_cm`, `kept`, `notes`, `photo_path`, and `conditions` (jsonb snapshot of the forecast hour).
  - RLS on, with one policy, "own catches": all actions where `auth.uid() = user_id`.
- No form, no saving, no photos, no storage bucket, no delete flow. The rows are mock data.

## What's missing

1. **Real log.** Add, edit and delete catches. Fill in `conditions` from the forecast hour at `caught_at`.
2. **Photo upload to Supabase Storage.** Private bucket `catch-photos`, path `{user_id}/{catch_id}.jpg` plus `{catch_id}_thumb.jpg`.
3. **Strip EXIF/GPS on the server.** Never trust the phone to do it.
   - The browser downscales to about 2000 px first, so uploads stay small.
   - A Next.js route then checks Pro, auto-rotates, resizes to 1600 px plus a 400 px thumb, re-encodes JPEG at q75, and uploads with the service role.
   - sharp drops metadata on re-encode unless told to keep it. We'll prove it with a test that asserts no EXIF/GPS in the output.
   - The original file is never stored.
4. **Rough location only.** No coordinates are stored. Either:
   - pick one of your spots (`spot_id`), or
   - an area cell of about 5 km (geohash at 5 characters, roughly 5 x 5 km).
   "Nearest spot" can use browser location, but it's worked out on the phone and the coordinates are never sent.
5. **Private by default.** Nobody else sees a catch, including other Pro users. No public URLs; photos load through short-lived signed URLs.
6. **Delete my data.**
   - "Delete all my catches" and "Delete my account" buttons, plus a CSV export.
   - Supabase says to delete files through the Storage API, not SQL, or they're left orphaned ([docs](https://supabase.com/docs/guides/storage/management/delete-objects)).
   - So the flow is: remove the `{user_id}/` folder first, then the rows. Account deletion cascades the rows from `auth.users`.

## Data model and RLS sketch

```sql
alter table public.catch_log
  add column area_cell  text,                         -- geohash-5, about 5 km; null if spot_id set
  add column thumb_path text,
  add column source     text not null default 'manual' check (source in ('manual','followup')),
  add constraint catch_where check (spot_id is not null or area_cell is not null),
  add constraint catch_photo_own check (photo_path is null or photo_path like user_id::text || '/%');

-- Photo paths are set by the upload route (service role), not by the client:
revoke update (photo_path, thumb_path) on public.catch_log from authenticated;

-- Storage: private bucket, owner can read and delete their own folder, server writes only.
insert into storage.buckets (id, name, public) values ('catch-photos', 'catch-photos', false);
create policy "own catch photos read" on storage.objects for select to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own catch photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- no insert/update policy: uploads go through the server route so EXIF is always stripped
```

Notes:
- The existing "own catches" policy stays.
- Pro gating sits in the app layer, as elsewhere in the prototype. If the log must be readable after a downgrade (we think it should), keep reads open and gate only new entries.

## Storage and egress cost

Prices are Supabase's published rates, in USD, checked 26 Oct 2026 (NZ time):
- [supabase.com/pricing](https://supabase.com/pricing)
- [storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)

| | Free | Pro ($25/month) |
| --- | --- | --- |
| File storage | 1 GB | 100 GB included, then $0.0213/GB-month |
| Egress (uncached) | 5 GB | 250 GB included, then $0.09/GB |
| Cached egress | 5 GB | 250 GB included, then $0.03/GB |
| Image Transformations | not included | 100 origin images, then $5 per 1000 |

**Our assumptions** (guesses, not data):
- Each catch stores about 0.35 MB (1600 px at q75 about 300 KB, plus a 30 KB thumb).
- Each Pro user logs 4 catches a month and opens the log 8 times a month: about 20 thumbs and 4 full photos per visit, about 14 MB a month each.

| Pro users | New storage/month | Storage after 12 months | Egress/month | Extra cost on Pro |
| --- | --- | --- | --- | --- |
| 1,000 | 1.4 GB | about 17 GB | about 14 GB | $0 (inside quota) |
| 10,000 | 14 GB | about 170 GB | about 140 GB | about $1.50/month storage by month 12 (70 GB x $0.0213); egress still inside 250 GB |

Takeaways:
- On Pro, photos cost close to nothing for a long time.
- Free would be full at about 2,800 photos (1 GB), so the log needs the Pro plan.
- We resize in our own route, so we skip Image Transformations ($5 per 1000 images after 100).
- I counted egress at the uncached $0.09 rate. Not sure if signed URLs on a private bucket get served as cached egress; check after launch on the usage page.
- Spend cap is on by default on Pro, so there's no surprise bill.

## MPI angle

MPI sets minimum sizes and daily limits per area. It's an offence to break them, with fines up to $500 and court fines beyond that ([MPI fishing rules](https://www.mpi.govt.nz/fishing-aquaculture/recreational-fishing/fishing-rules/)).

A public photo feed would sooner or later show an undersize or over-limit fish:
- People pile on, the poster gets reported, and Salt Supply looks like it's showing off illegal catch.
- We'd have to moderate and measure fish from photos, which we can't do reliably.

Keeping photos private avoids all of that.

If a private entry is marked kept and is under the minimum size, we can show a soft note: "Under the usual minimum for this species. Check MPI rules for your area." It doesn't block the entry. The size data in `src/lib/rules.ts` is still sample data, so this waits for verified MPI sizes. This is not legal advice.

## Option (not approved): "How'd it go?" email

- **When:** the morning after an alert window ends, at 8am NZ.
  - Pro only, max 1 a week, separate from the 2-a-week alert cap.
  - One-tap off switch. Skipped while paused.
- **Email:**
  - Subject "How'd it go at Hauraki Gulf on Sat?"
  - Two buttons: "Caught something" and "Nothing doing". Then four species chips for that spot, plus "Other".
- **Taps:**
  - Buttons open a signed-token page that records with one more tap. Email link scanners open links, so a bare GET must not save anything.
  - The answer is saved as a `catch_log` row with `source = 'followup'`, or as a "nothing" outcome.
  - A photo can be added later.
- **Table:** `catch_followups` (user, spot, window start/end, engine version, rating, outcome, species), unique per user and window. RLS like `pause_reminders_sent`: own read, server writes only.
- **How Forecast Brain could use it:**
  - Gets a nightly export with no user ids: spot, window, rating, engine version, outcome, species.
  - First use: a hit rate per rating band ("Great" windows caught X% of the time). This checks whether the ratings mean anything, and later tunes per-spot and per-species weights.
  - Caveats: people report wins more than duds, and you need a few hundred answers per spot before it says much.
  - The privacy policy needs a line about it.

## Later: opt-in sharing

- Off by default and chosen per catch. Each share is reviewed before going public.
- Location shown only as a region name or a blurred area of 10 km or more, with a random offset. Never the spot.
- Optional delay of 7 days before it shows, so nobody races to the spot.
- Report button: undersize, wrong place, offensive, not mine. Hidden automatically after 3 reports until reviewed.
- No comments at first.
- Delete still works, and removes the shared copy as well.

## Rough effort

| Piece | Days |
| --- | --- |
| Real log: form, list, edit, delete, conditions snapshot | 2 to 3 |
| Photo pipeline: upload route, sharp, strip test, thumbs, signed URLs | 2 |
| Rough location: spot picker, on-phone nearest, area cell | 1 |
| Migration, RLS, storage policies, checks | 1 |
| Delete my data, account clean-up, CSV export | 1 to 1.5 |
| Mobile QA and polish | 1 |
| **Private log total** | **8 to 9.5** |
| Option: "How'd it go?" email, token page, table, cap, checks | 3 to 4 |
| Option: Forecast Brain export (our side only) | 1 |
| Later: opt-in sharing with blur, report and review queue | 5 to 8 |
