# Orange Lobby

Event-management app for Ecopia Events, built with Next.js and Supabase.

Copy `.env.example` to `.env.local` and fill in the Supabase project values before running the app. Run `npm test` to run the Vitest suite.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

Run tests:
```bash
npm test
```

Build for production:
```bash
npm run build
```

## Documentation

- [Runbook](docs/runbook.md) — deployment, event management, registration, badges, onsite scanning, attendance export
- [Spec](docs/superpowers/specs/2026-09-07-orange-lobby-pilot.md)
- [Implementation plan](docs/superpowers/plans/2026-09-07-kom-pilot.md)

## Dry-run checklist

- [ ] 200-row fake masterlist imports with 0 skipped rows
- [ ] Registration open → 3 team members register from phones → appear in list
- [ ] ZIP of QRs opens; 5 printed on paper
- [ ] Two crew phones scan the same badge: first green, second amber
- [ ] Name search finds a person with partial name; tap checks in
- [ ] Walk-in adds and checks in
- [ ] Personal link on iPhone Safari and Android Chrome: home, agenda (VIP-only item hidden for non-VIP), seat, news, info
- [ ] Attendance export shows Day 1 / Day 2 columns
- [ ] Draft status shows "Coming soon"; live shows portal
