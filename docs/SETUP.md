# Setup

Get Eric running in under 10 minutes.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/claude-code) installed and authenticated
- Git
- Python 3.10+ (for the SDAR skill bank and publish pipeline)
- Node.js 18+ (optional — only needed if you add Node-based hooks or tools)

## Installation

### 1. Use this repo as a template

Click **"Use this template"** on GitHub, or clone directly:

```bash
git clone https://github.com/notaneric/claude-personal-assistant.git my-agent
cd my-agent
```

### 2. Set your persona name

By default the assistant is named Eric. To rename:

```bash
# Find every occurrence and replace with your chosen name
grep -rl "Eric" . \
  --include="*.md" \
  --include="*.json" \
  --include="*.yml" \
  | xargs sed -i 's/Eric/YOUR_NAME/g'
```

Or leave it as Eric — the joke works.

### 3. Copy and customize settings

```bash
cp .claude/settings.example.json .claude/settings.json
```

Edit `.claude/settings.json` to:
- Set your pre-approved tool permissions
- Configure any hooks you want active
- Add or remove MCP servers

The example file includes inline comments explaining each field.

### 4. Initialize the skill bank

```bash
cp sdar/skill_bank.template.json sdar/skill_bank.json
```

This creates your local skill bank with neutral priors (all scores at 0.5). The SDAR loop will tune these over time as you use the system. The `sdar/skill_bank.json` file is gitignored — it's personal state, not template state.

### 5. Set up your knowledge vault (optional)

Eric's research and memory flow through a knowledge vault. Any directory of Markdown files works. Set the path in `.claude/settings.json`:

```json
{
  "env": {
    "KNOWLEDGE_VAULT_PATH": "/path/to/your/vault"
  }
}
```

If you use Obsidian, point this at your vault root. If you don't have one yet, create an empty directory — the `/graphify` command will populate it over time.

### 6. Verify the install

Open Claude Code in your project directory and run:

```
/status
```

Eric should report: active skills, skill bank entry count, and knowledge vault status (if configured).

## First run checklist

- [ ] `settings.json` exists (copied from example)
- [ ] `sdar/skill_bank.json` exists (copied from template)
- [ ] Persona name is what you want
- [ ] Knowledge vault path set (or skipped for now)
- [ ] Run `/status` — no errors

## Updating

Pull the latest template changes and re-run the publish pipeline to merge updates with your local customizations:

```bash
git fetch upstream
git merge upstream/main
bash scripts/publish.sh --merge-only
```

See `docs/CUSTOMIZATION.md` for how to safely layer your personal configuration on top of template updates without losing changes.
