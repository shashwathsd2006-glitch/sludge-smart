# Git repository hygiene

## Observed state

- `git rev-parse --show-toplevel` resolves to `/Users/shashwathsduvani`, not the project directory.
- The project directory `/Users/shashwathsduvani/Downloads/sludge-smart-main` is untracked in that home-rooted repository.
- No commits, remotes, staged index entries or project-local git objects were observed.
- No git state was changed during final QA.

## Recommended next action

Ask the owner for an explicit decision before any git operation. The safe options are:

1. **Keep the existing home-rooted repository.** Add only the intended project files with a path-limited command from the project directory, then review before committing. This repository is unusually broad and commits would be relative to the home directory.
2. **Create a dedicated project repository.** Run `git init` in the project directory only after approval, then add and review files there. Do not initialize nested repositories without an owner decision.

Do not run `git add -A` from the home root, do not commit secrets, and do not create a remote, commit, push or deploy without explicit approval.

## Safe inspection commands

```bash
# From the project directory
git status --short --untracked-files=all -- .
git status --short --ignored -- .
git check-ignore -v .env.example .env data/sludge_smart.db node_modules dist .venv .DS_Store
git rev-parse --show-toplevel
```

## Ignore rules

`.gitignore` now ignores dependencies, build output, local databases, caches, logs, environment files, virtual environments and OS metadata. `.env.example` is explicitly unignored so the non-secret template can be committed.

Verified after the change:

```bash
git check-ignore -q .env.example; printf '%s\n' "$?"
# 1 = not ignored

git check-ignore -q .env; printf '%s\n' "$?"
# 0 = ignored
```

## Files to exclude from any commit

- `.env` and any file containing real passwords, hashes, tokens or API keys.
- `data/sludge_smart.db*` and backup copies.
- `node_modules/`, `dist/`, `.venv/`, `.pytest_cache/`, `__pycache__/`, logs and OS metadata.

## Files that should be reviewable

- Source files under `src/`, `backend/` and `shared/`.
- Migration SQL and schema files.
- Documentation under `docs/`, plus `README.md`, `.env.example` and `.gitignore`.
- Test files under `backend/tests/`.
