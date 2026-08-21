# Nirnay — Shutdown Window Decision Engine

DTAI Capstone project. Tata Motors Passenger Vehicles — Pune plant, Body Shop, Line 2.

Predicts expected production-loss exposure for 14 body shop assets and allocates the
next maintenance shutdown window across competing jobs under crew, spare, and
duration constraints. See `PRD_Nirnay_v2.md` for the full product spec.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS, Recharts (sensor trend charts)
- Gemini API for constrained window allocation and technician-note classification
- Seeded synthetic data (fixed random seed) in `/data`

## Build order (matches PRD §14)

1. ✅ Seed data — `scripts/generate-seed.ts`
2. ✅ `lib/scoring.ts` + `lib/exposure.ts` — risk index and ₹ exposure model
3. ✅ Screen 1 — Exposure Board (`app/page.tsx`), sort toggle + drawer
4. ⬜ Knapsack baseline (`lib/knapsack.ts`)
5. ⬜ `/api/allocate` + Screen 2 — Window Planner
6. ⬜ Cache a good allocation for demo-day fallback
7. ⬜ Deploy + cross-device test
8. ⬜ Backup demo video
9. ⬜ `/api/classify` + feedback panel

## Local development

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

## Regenerating seed data

```bash
npx tsx scripts/generate-seed.ts
```

Fixed random seed — output is deterministic. The console output verifies the
WG-07 / RB-03 exposure inversion against the PRD's §6.2 worked example.
