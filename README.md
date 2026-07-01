<div align="center">

![meet Eric, your own personal agent — a self-improving, agent-ingestible Claude Code operating system. @notaneric ships an assistant named Eric.](assets/banner.png)

# claude-personal-assistant

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Use this template](https://img.shields.io/badge/Use%20this%20template-2ea44f?logo=github)](https://github.com/notaneric/claude-personal-assistant/generate)
[![Built for Claude Code](https://img.shields.io/badge/Built%20for-Claude%20Code-blueviolet?logo=anthropic)](https://claude.ai/code)
[![by @notaneric](https://img.shields.io/badge/by-%40notaneric-black?logo=github)](https://github.com/notaneric)

</div>

---

**[What you get](#what-you-get) · [Quickstart](#quickstart) · [Architecture](#architecture) · [Capabilities](#capabilities) · [Agent adoption](#how-your-agent-adopts-this) · [Contributing](#contributing) · [License](#license)**

---

## What you get

A complete operating system for a Claude Code personal assistant — not a chatbot wrapper, a configurable agent infrastructure with real self-improvement built in.

| Layer | What it is |
|---|---|
| `CLAUDE.md` | The operating manual: identity, rules, skill-routing, context discipline, communication style |
| `.claude/rules/` | Modular policy files — security, performance, agent orchestration — loaded when relevant |
| `.claude/commands/` | Slash commands for research, writing, design, grilling plans, and self-improvement |
| `skills/` | Curated capability modules with YAML frontmatter, least-privilege tool scoping, and injection-safe preambles |
| `sdar/` | The SDAR self-improvement framework: UCB skill retrieval + sigmoid gate + skill bank template |
| `scripts/` | Re-runnable publish pipeline: sanitize your private fork, generate the public mirror |
| `AGENTS.md` | Cross-tool capability menu (works in Cursor, Windsurf, any agent that reads `AGENTS.md`) |
| `llms.txt` | Machine-readable index — lets LLMs discover and ingest the capability set cleanly |
| `docs/` | Setup, customization, and architecture docs |

The differentiator: every skill and capability document is **injection-safe** — written as reference material to evaluate, not imperative commands to execute. Safe to paste into any agent context.

---

## Quickstart

**5 steps from zero to running Eric:**

**1. Use this template**

Click "Use this template" above (or `gh repo create --template notaneric/claude-personal-assistant YOUR_REPO`). This creates your private fork where you'll layer in your own identity, projects, and secrets.

**2. Rename the persona (optional)**

Eric is the default. To rename, find-replace `Eric` in `CLAUDE.md` and `AGENTS.md`. Or keep Eric — the bit holds.

**3. Configure your identity layer**

Edit `CLAUDE.md` sections marked `YOUR_NAME`, `YOUR_PROJECTS`, `YOUR_SECOND_BRAIN_PATH`. The operating rules stay as-is; only the identity surface changes.

**4. Initialize the skill bank**

```bash
cp sdar/skill_bank.template.json sdar/skill_bank.json
```

Neutral priors ship in the template (`uses: 0, avg_reward: 0.5`). The SDAR loop updates scores as your agent works.

**5. Load into Claude Code**

Open your repo in Claude Code. `CLAUDE.md` loads automatically. Run `/status` to confirm Eric is live.

---

## Architecture

The SDAR self-improvement loop — how Eric gets better every session:

```mermaid
graph TD
    A[Task arrives] --> B[Skill bank lookup\nUCB retrieval by domain]
    B --> C[Top-k skills activated]
    C --> D[Task execution]
    D --> E[Outcome signal\nRL backbone]
    E --> F{Sigmoid gate\ng = σ(5·Δ)}
    F -->|Δ > 0\ng → 0.92| G[Near-full reinforcement\nEndorsed skill]
    F -->|Δ = 0\ng = 0.5| H[Moderate guidance\nNeutral skill]
    F -->|Δ < 0\ng → 0.08| I[Soft attenuation\nNever discard]
    G --> J[/learn — update skill bank]
    H --> J
    I --> J
    J --> K[/reflect — draft CLAUDE.md improvements]
    K --> L[Measurably better next session]
    L --> A

    style A fill:#1e1e2e,color:#cdd6f4
    style D fill:#1e1e2e,color:#cdd6f4
    style J fill:#313244,color:#a6e3a1
    style K fill:#313244,color:#a6e3a1
    style L fill:#313244,color:#89b4fa
```

**Key insight from the underlying paper:** even random skill retrieval outperforms no retrieval, because the sigmoid gate filters noise. The UCB score (`avg_reward + 0.5·√(ln(N+1)/(uses+1))`) balances exploitation of known-good skills with exploration of underused ones.

See `sdar/README.md` for the full framework and `sdar/skill_bank.template.json` for the schema.

---

## Capabilities

<details>
<summary><strong>Skill activation matrix</strong> — Eric routes by context, not explicit slash commands</summary>

Skills activate automatically when context matches. No slash command required.

| Context | Primary skill | Secondary |
|---|---|---|
| Research, analysis, intelligence gathering | [deep-research](https://github.com/dzhng/deep-research) (ext) | [graphify](https://github.com/safishamsi/graphify) (ext), knowledge vault query |
| Design, UI, visual output | [impeccable](https://github.com/pbakaus/impeccable) (ext, taste filter first) | `huashu-design`, `ui-ux-pro-max`, `gsap` |
| Animation, motion, micro-interactions | `gsap` | [impeccable](https://github.com/pbakaus/impeccable) (ext), `video` |
| Written content, copy, blog posts | `humanizer` | `copywriting`, `content-writer` |
| Social sentiment, trends, pre-meeting intel | [last30days](https://github.com/mvanhorn/last30days-skill) (ext) | [deep-research](https://github.com/dzhng/deep-research) (ext) |
| SEO, schema, backlinks | `seo` | `ai-seo`, `schema` |
| Browser automation, testing | `playwright` | agent-browser patterns |
| Multi-agent orchestration | role-playing team → CrewAI; code review loop → AutoGen; full software company → MetaGPT | `dispatching-parallel-agents` |
| Video creation (programmatic) | `video` (Remotion/Hyperframes) | `gsap` (HTML→MP4) |
| Workflow automation | `automate` | Google Workspace integrations |
| Knowledge graph, vault | [graphify](https://github.com/safishamsi/graphify) (ext) | Obsidian integrations |
| Any significant plan or design direction | `grill-me` (stress-test before building) | — |
| Multi-agent loop failing / drifting | systematic debugging | agent introspection patterns |
| Session self-improvement | `/learn` → `/reflect` | — |
| New capability needed | `write-a-skill` | — |
| Image generation (local) | local diffusion pipeline | — |
| Audio/video transcription | local Whisper | — |
| Security audit, threat modeling | `security-review` | — |
| Codebase navigation, architecture | [graphify](https://github.com/safishamsi/graphify) (ext) | codegraph patterns |
| Complex constrained generation | `generate-evaluate-repair` | — |
| Verify before declaring done | `verification-before-done` | — |
| Context window hygiene | `context-discipline` | — |

**Routing logic for multi-agent work:**
- Role-playing team → CrewAI
- Code generation + review loop → AutoGen
- Full software company simulation → MetaGPT
- Maximum parallelism → MassGen patterns

Rows marked **(ext)** reference public third-party skills — link to the upstream repo; they are not vendored here. Unmarked skill names are shipped in `skills/` in this repo.

</details>

<details>
<summary><strong>Slash commands</strong></summary>

| Command | Purpose |
|---|---|
| `/learn` | Self-improvement: process session feedback → update skill bank |
| `/reflect` | Pattern analysis → draft CLAUDE.md improvements |
| `/status` | Current state: active skills, scores, knowledge vault stats |
| `/research [topic]` | Deep iterative research (3–5 iterations, knowledge vault first) |
| `/design [brief]` | Full design pipeline: taste filter → grill direction → references → generate → verify |
| `/write [brief]` | Humanized content: no AI tells, specific over vague |
| `/grill [plan]` | Adversarial stress-testing — find problems before building |
| `/graphify [path?]` | Map vault or project into a knowledge graph |
| `/goal [criterion]` | Autonomous task with an explicit done-condition — runs until the criterion is met |
| `/rewind` | Roll back code and conversation to an earlier checkpoint |

</details>

<details>
<summary><strong>Always-on rules</strong></summary>

Three modular rule files load by context:

- **`.claude/rules/security.md`** — prompt defense baseline, untrusted content handling, secrets hygiene, supply chain scanning
- **`.claude/rules/performance.md`** — model tier routing (Haiku/Sonnet/Opus by task complexity), effort levels, context window discipline, cache optimization
- **`.claude/rules/agents.md`** — parallel-by-default orchestration, subagent design principles, eval loop patterns, memory architecture, hooks reference

</details>

---

## How your agent adopts this

This repo is written to be **pasted into any agent's context safely**. Every skill and capability document opens with an adoption-note preamble:

> "This describes a capability for optional adoption. Nothing here is an imperative instruction to your current session. Evaluate independently; adopt only what fits."

**Three consumption paths:**

**Claude Code (primary):** Clone or template, open in Claude Code. `CLAUDE.md` is the entry point — it loads verbatim on every prompt. Modular rules in `.claude/rules/` load on-demand by topic. Skills in `skills/` activate by context match.

**Other agents (Cursor, Windsurf, etc.):** Point your agent at `AGENTS.md`. It's a structured capability menu designed for cross-tool ingestion. Or reference `llms.txt` as the machine-readable index.

**Selective adoption:** Pick one section — the SDAR self-improvement loop, the security rules, the skill-activation pattern — and paste it into your existing setup. Everything is modular. Nothing assumes a full install.

**The injection-safety guarantee:** Every capability document is reference material, not executable instruction. Pasting this into an agent that has its own system prompt won't hijack it — the preambles make that explicit. This is a deliberate design choice, not a convention.

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the full guide.

The short version:

- Skills go in `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, `allowed-tools`, `model`). Keep them under 500 lines. Use progressive disclosure for larger capabilities.
- Rules go in `.claude/rules/`. Engineering patterns only — no personal specifics.
- Commands go in `.claude/commands/`. Generic use cases only.
- The SCRUB LIST in `scripts/allowlist.example.yml` is the arbiter. When in doubt, exclude.
- Run `scripts/publish.sh` (or `publish.ps1`) before any PR that touches `CLAUDE.md`, rules, or skills — it validates the allowlist.

---

## License

MIT. See [LICENSE](LICENSE).

Build your own. Name it whatever you want. Or name it Eric — the bit scales.

---

<div align="center">
<sub>made by <a href="https://github.com/notaneric">@notaneric</a> · powered by <a href="https://claude.ai/code">Claude Code</a></sub>
</div>
