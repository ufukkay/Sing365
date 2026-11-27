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
