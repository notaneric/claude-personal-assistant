# Sync Pipeline

The `scripts/` directory contains the living-mirror publish pipeline. Its job: copy only explicitly-allowed files from your private source repo into a clean public output directory, after scanning for secrets, identity tokens, and hidden unicode, and refuse to proceed unless the scan is clean.

Default-deny. Opt-in per file. Manual confirm before any push.

---

## How it works

```
private source repo
        │
        ▼
  allowlist.yml          ← you maintain this; default-deny
        │
        ▼
  [resolve paths]        ← glob expansion against source tree
        │
        ▼
  [security scan]        ← secrets regex + hidden unicode + scrub tokens
        │  aborts on any hit
        ▼
  [review summary]       ← printed to terminal; no files moved yet
        │
        ▼
  [--confirm / -Confirm] ← manual flag required
        │
        ▼
  public output dir      ← clean copy, placeholder tokens intact
        │
        ▼
  [--push / -Push]       ← optional; cd output dir + git push
```

The pipeline never moves files until you pass the confirm flag. It never pushes unless you also pass the push flag.

---

## Quick start

**1. Create your allowlist**

```bash
cp scripts/allowlist.example.yml scripts/allowlist.yml
```

Edit `allowlist.yml`:
- Fill in `owner.name` and `owner.email` with your real name/email. These become scrub tokens, if they appear anywhere in a file queued for publish, the pipeline aborts.
- Add any client or company names to `scrub_tokens`.
- Set `publish: true` for each file you want in the public output. Everything else defaults to `false`.

`allowlist.yml` is git-ignored. Never commit it with real personal data.

**2. Dry-run to see what would publish**

```bash
# POSIX
./scripts/publish.sh --dry-run

# Windows
.\scripts\publish.ps1 -DryRun
```

**3. Preview (scan + summary, no copy)**

```bash
./scripts/publish.sh
.\scripts\publish.ps1
```

**4. Actually copy files**

```bash
./scripts/publish.sh --confirm
.\scripts\publish.ps1 -Confirm
```

**5. Copy and push**

```bash
./scripts/publish.sh --confirm --push
.\scripts\publish.ps1 -Confirm -Push
```

The push step runs `git add -A && git commit && git push` inside the output directory. That directory must already be a git repo pointed at your public remote.

---

## What the scan checks

**Secret patterns (regex, case-insensitive):**
- `api_key`, `api-key`, `token` followed by a value 20+ chars
- `sk-` prefixed strings (common API key format)
- `nvapi-` prefixed strings
- CLI secrets-manager fetch patterns (e.g., `bw get`, `vault kv get`)
- Discord / Slack / generic webhook URLs
- Email addresses (any `foo@domain.tld` pattern)

**Hidden unicode:**
- Zero-width spaces, joiners, non-joiners, BOM, bidi override characters, common prompt-injection vectors

**Scrub tokens:**
- Your real name and email (from `owner` block in allowlist.yml)
- Any strings listed under `scrub_tokens` (client names, company names, etc.)
- Case-insensitive substring match, partial matches count

Any hit aborts the pipeline with a report. No files are copied.

---

## Allowlist format

The allowlist is a YAML file with three sections:

```yaml
owner:
  name: "Your Real Name"
  email: "you@example.com"
  aliases: []

scrub_tokens:
  - "ClientName"
  - "CompanyName"

files:
  - path: "README.md"
    publish: true
  - path: ".private/**"    # private working memory, logs, pending specs, never public
    publish: false
```

- `path` is relative to the source repo root. Glob patterns (`**`, `*`) are supported.
- Files not listed default to `publish: false`.
- The `publish: false` entries are optional but useful as documentation of what must never publish.

---

## Output directory

Default: `../claude-personal-assistant-public` (sibling of your private repo). Override with `--output` / `-OutputDir`.

Set up the output dir as a separate git repo before using `--push`:

```bash
mkdir ../claude-personal-assistant-public
cd ../claude-personal-assistant-public
git init
git remote add origin https://github.com/YOUR_HANDLE/claude-personal-assistant.git
```

Then the push step commits and pushes from that directory.

---

## Dependencies

| Tool | Required | Notes |
|---|---|---|
| `python3` | yes | Handles YAML parsing and scanning. No third-party packages needed, stdlib only. |
| `git` | yes (for push) | Only needed for the push step. |
| `bash 4+` | POSIX only | `publish.sh` uses `mapfile`; requires bash not sh. |
| `PowerShell 5.1+` | Windows only | `publish.ps1` works on both Windows PowerShell and PS7. |

---

## Running on a schedule

If you want the public repo to stay in sync automatically, run the pipeline in CI against the private repo. A minimal GitHub Actions workflow:

```yaml
# .github/workflows/sync-public.yml (in your PRIVATE repo)
on:
  push:
    branches: [main]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish
        run: |
          cp scripts/allowlist.example.yml scripts/allowlist.yml
          # In CI, owner tokens are placeholders, no real name to scrub
          ./scripts/publish.sh --confirm --output /tmp/public-output
      - name: Push to public repo
        uses: cpina/github-action-push-to-another-repository@v1.7.2
        with:
          source-directory: /tmp/public-output
          destination-github-username: YOUR_HANDLE
          destination-repository-name: claude-personal-assistant
          user-email: YOUR_EMAIL
        env:
          API_TOKEN_GITHUB: ${{ secrets.PUBLIC_REPO_PAT }}
```

In CI, use the example allowlist (which has placeholder owner fields) so the scrub scan doesn't need your real name injected as a secret.

---

## Security notes

- `allowlist.yml` is git-ignored. Never commit it with real personal data.
- The scan catches the most common secret patterns but is not a substitute for a dedicated secrets scanner like `gitleaks` or `truffleHog` on your private repo's history. Use those tools separately.
- The pipeline blocks on first scan hit, it does not attempt to auto-redact or strip secrets. You fix, you re-run.
- Treat the output directory as public from the moment files land there. Do not write anything to it manually that you haven't run through the pipeline.
