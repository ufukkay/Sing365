# Sing365

Centralized email signature management for Microsoft 365.

## How this repo is built

The product is built with the [Replica skill pack](https://github.com/Jakeschincariol/replica-skill) (MIT), vendored in `.claude/skills/`. Each step writes to `replica/`:

```
recon -> architect -> design -> build -> backend -> test -> diff -> entrepreneur -> brand -> launch -> deploy
```

- `replica/recon.md`: research map of the product category (public sources only)
- `replica/features.csv`: feature matrix, scored by `python3 .claude/skills/replica-diff/parity.py replica/features.csv`

Everything is written fresh. Before launch, `python3 .claude/skills/replica-brand/sweep.py . --avoid "Exclaimer"` must pass on the product code.

## Run it locally

```bash
pnpm install
SING365_DEV_AUTH=1 pnpm dev          # http://localhost:3000 (panel), /design (components)
pnpm test                             # rule engine, renderer, signature service
SING365_URL=http://localhost:3000 node apps/addin/test/commands.sim.mjs   # simulated Outlook compose
```

Layout: `apps/web` (Next.js panel + add-in API), `apps/addin` (Outlook manifest), `packages/rules` (who gets which signature), `packages/render` (email-safe HTML). Data is seed data until `/replica-backend`.

To sideload the add-in you need an HTTPS URL: `SING365_PUBLIC_URL=https://... SING365_ADDIN_ID=<guid> pnpm manifest`, then upload `apps/addin/dist/manifest.xml` in Outlook > Get Add-ins > My add-ins.
