# Horse Champions Derby

A family reimagining of Sega's Derby Owners Club: raise, train, groom and race your own horse, then breed the next generation. Paper-craft art, web-first, phone-friendly.

## Run
```
npm install
npm run dev        # local dev server (open on your phone via the LAN address)
npm run build      # single-file build in dist/index.html
npm run sim:test   # headless race balance check
```

## Deploy (Vercel)
Import this repo in Vercel; it detects Vite. Build command `npm run build`, output `dist`.
Family play uses Supabase Realtime. The project URL and publishable key in `src/net/config.ts`
are public by design; they can be overridden with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Testing family play without the internet
Open the built file (or add `?local` to the URL) in several tabs of one browser: rooms link the tabs
directly, no server needed.

## Layout
- `src/sim/` race engine (seeded, fixed-step), field and foal generation, growth rules (bands, hidden peaks, tiers)
- `src/game/` Phaser race scene, portraits, full-body horse, jockey, barn critters, names
- `src/training/` the six drills, grooming kit, jockey room, grades
- `src/career/` 25-race career, retirement cards + QR, breeding
- `src/net/` family-play rooms (Supabase Realtime or local tabs) and the lobby
- `src/main.ts` stable hub, race office, results and the glue
