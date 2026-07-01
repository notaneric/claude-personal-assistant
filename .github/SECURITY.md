# Security Policy

## Scope

This repo ships an operating system for Claude Code agents — CLAUDE.md patterns, hook configs, skill definitions, and a publish pipeline. Security issues in this context include:

- Prompt injection vectors in any shipped file (CLAUDE.md, AGENTS.md, skill SKILL.md files, docs)
- Hook patterns that could be exploited to execute arbitrary code
- Publish pipeline logic that leaks personal data into a public repo
- Injection-safety CI bypass techniques
- Supply chain issues in skill or MCP references

Issues in Claude Code itself or the Anthropic API belong upstream — report those at [https://www.anthropic.com/security](https://www.anthropic.com/security).

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report via [GitHub private advisory](https://github.com/notaneric/claude-personal-assistant/security/advisories/new). This keeps the details confidential until a fix is ready.

Include:

- A clear description of the vulnerability
- Steps to reproduce or a minimal proof-of-concept
- The potential impact (e.g., "an agent adopting this skill could be made to exfiltrate context")
- Your suggested fix, if you have one

## Response timeline

- Acknowledgment within 3 business days
- Triage and severity assessment within 7 days
- Fix or mitigation shipped as fast as complexity allows — critical injection issues within 72 hours of confirmation

## Disclosure policy

Coordinated disclosure. Once a fix is merged, a public advisory is published crediting the reporter (unless they prefer anonymity). We do not offer a bug bounty for this project.

## Out of scope

- Issues that require the user to have already committed malicious content to their own repo
- Generic Claude/Anthropic model behavior (hallucinations, refusals, etc.)
- Theoretical attacks with no practical exploitation path
