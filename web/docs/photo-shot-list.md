# Photo shot list — Salt Supply Co.

Real photos only: no stock libraries, no AI-generated images. Shot in New Zealand, natural light, people (if any) with a signed release. Until a photo exists the site shows a grey `PHOTO: <subject> (<ratio>)` box (`PhotoSlot`, `web/src/components/ui.tsx`), tagged with the shot id in `data-photo-id`.

Deliver as JPEG (sRGB, quality 80+) at or above the minimum size; the site will make the smaller versions. Keep the main subject inside the middle 60% so it survives cropping on mobile.

| ID | Subject | Used on | Aspect | Min size (px) | Orientation / notes |
|---|---|---|---|---|---|
| `home-hero` | Small trailer boat heading out from a NZ boat ramp at first light; calm-ish water, no logos | Home, beside the headline (`/`) | 3:2 | 1800 × 1200 | Landscape. Shown half-width on desktop, full-width under the headline on mobile. Horizon in the upper third. No faces needed. |
| `about-main` | A local fisher on a wharf or rocks, rod in hand, back or three-quarter view | About (`/about`) | 3:2 | 1800 × 1200 | Landscape. Real person, real gear, no posed grins. Release needed if the face is visible. |
| `spot-<spot_id>` (23 shots) | The spot itself: shoreline, ramp or water as you'd see it arriving, wide | Spot page header (`/spots/<id>`) | 3:1 | 2400 × 800 | Wide landscape banner, capped at 224 px high on screen. Keep the subject centred; the sides crop on mobile. One per spot id below. |

Spot ids for `spot-<id>`: banks_peninsula, bay_of_islands, bay_of_plenty, bluff, catlins, central_otago_lakes, coromandel, dunedin, east_cape, far_north, fiordland, greymouth, haast_jackson, hauraki_gulf, hawkes_bay, kaikoura, marlborough_sounds, moeraki, nelson_bays, southern_lakes, stewart_island, taranaki, wellington.

Nice to have later (no slot yet): `og-default` 1200 × 630 (1.91:1) for link previews, `email-header` 1200 × 400 (3:1) for alert emails.
