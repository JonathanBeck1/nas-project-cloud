# Contributing

Thanks for your interest. NAS Project Cloud is a small self-hosted product, and the bar for changes is "small, focused, well-tested, and obvious to read."

## Quick start

```bash
git clone https://github.com/JonathanBeck1/nas-project-cloud.git
cd nas-project-cloud
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3000>, finish owner setup, and you're in.

## Branch and commit conventions

- Branch names: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`.
- Commit messages: short, lowercase imperative subject, scope-prefixed when useful (matches existing history). Examples: `feat: add tag manager`, `fix: clamp upload offset on rejoin`, `chore: bump sharp`.
- One PR per concern. Squash merge to `main`.

## Verification gate

Every PR must keep these green locally before review:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The same gate runs in [`ci.yml`](./.github/workflows/ci.yml) on every pull request.

## Tests

- Unit and component tests live under `tests/server/` and `tests/components/` and run with [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/).
- End-to-end tests live under `tests/e2e/` and run with [Playwright](https://playwright.dev/). The Playwright config boots its own dev server on port 3100 and uses a sandboxed `.data/e2e/` directory.
- New features need at least one unit test or component test. UI changes that touch a real flow (auth, upload, archive, project workspace) should add or extend an e2e test.

## Filesystem and storage

- Never commit anything under `.data/`, `.next/`, `node_modules/`, `playwright-report/`, `test-results/`, or `.worktrees/` — `.gitignore` already covers them.
- Storage paths flow through `createStorageService()`. Don't bypass it; it enforces a sandbox check that blocks `..` traversal.

## Schema changes

- All schema lives in `src/lib/server/db.ts` under `migrate(db)`. Add new columns via `addColumnIfMissing` for backwards compatibility on existing TrueNAS deployments. Don't drop or rename columns without a migration plan.
- New tables get a matching index for any column you'll filter on.
- Update `src/lib/shared/types.ts` and `src/lib/server/metadata.ts` in the same PR as a schema change.

## Filing issues

- Bug reports: please include the deployed image SHA or `git rev`, the host OS (TrueNAS SCALE version if relevant), browser, and a reproduction.
- Feature requests: state the problem first, propose the solution second.

Templates for both live under `.github/ISSUE_TEMPLATE/`.

## Security

If you find a security issue, please email the maintainer instead of opening a public issue. Do not file CVE-style reports through the issue tracker.

## License

By contributing you agree that your changes will be licensed under the [MIT License](./LICENSE).
