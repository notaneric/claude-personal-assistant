# Contributing

Thanks for considering a contribution to `claude-personal-assistant`. This is an opinionated template — contributions that make it more useful to a wider audience are welcome; contributions that re-introduce personal data or break injection safety are not.

## What belongs here

- Bug fixes in the operating system patterns (rules, hooks, SDAR logic)
- Generic skills that a broad range of Claude Code users would actually activate
- Improvements to docs, the publish pipeline, or CI gates
- Injection-safety improvements

## What does not belong here

- Personal data of any kind (real names, emails, API keys, project specifics, financial data)
- Third-party skills vendored directly — link to the upstream repo instead
- Changes that weaken the prompt defense baseline or permit-deny list without a documented security rationale

## Getting started

1. Fork the repo and clone your fork.
2. Create a branch: `git checkout -b feat/your-thing`.
3. Make your changes, following the guidelines below.
4. Run the injection-safety check locally before opening a PR:
   ```bash
   bash scripts/check-injection.sh   # or scripts/check-injection.ps1 on Windows
   ```
5. Push and open a pull request against `main`. Fill in the PR template.

## Code and prose standards

- Prose must be humanizer-clean: no AI tells ("delve into", "it's important to note", "furthermore"), no filler openers ("Certainly!", "Great question!"), no em-dash overuse.
- Every skill file needs valid YAML frontmatter with at minimum: `name`, `description`, `allowed-tools`.
- Docs go in `docs/`. Skills go in `skills/<name>/SKILL.md`. Rules go in `.claude/rules/`. Do not scatter configs.
- One logical change per PR. Keep diffs reviewable.

## Commit style

```
type(scope): short description

Longer explanation if needed. Why, not what.
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `security`.

## Review process

PRs are reviewed by @notaneric. Expect a response within a few days. Security-sensitive changes (rules, deny lists, hooks) get closer scrutiny and may request changes before merge.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By contributing, you agree to abide by it.
