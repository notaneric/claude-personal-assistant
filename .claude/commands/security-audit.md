# /security-audit [target]: Security Analysis & Threat Modeling

Structured security analysis for code audits, threat modeling, and defensive security work. Mapped to five frameworks across 26 domains.

## Skills Activated
Primary: cybersecurity  
Secondary: deep-research, graphify (for codebase context)

## Scope: What This Command Is For
- Code security reviews (your own projects)
- Threat modeling and architecture reviews
- Dependency vulnerability scanning
- Security posture assessment (NIST CSF 2.0)
- AI/ML system security (MITRE ATLAS)
- Authorized penetration testing scopes
- CTF challenges

NOT for: attacks on systems you don't own, DoS, credential stuffing, social engineering, detection evasion for malicious use.

## Framework Coverage
| Framework | Version | Best for |
|---|---|---|
| MITRE ATT&CK | v19.1 (286 techniques) | Threat modeling, red team planning |
| NIST CSF 2.0 | 22 categories, 6 functions | Security posture assessment |
| MITRE D3FEND | v1.3 (267 countermeasures) | Defensive control mapping |
| MITRE ATLAS | v5.4 (AI/ML threats) | AI system adversarial threats |
| NIST AI RMF | 1.0 (72 subcategories) | AI trustworthiness audit |

## Modes
```
/security-audit code [file or dir]     # Code review, OWASP Top 10 + language-specific
/security-audit deps [package.json]    # Dependency vulnerability scan
/security-audit threat-model [system]  # Threat modeling session
/security-audit ai [system brief]      # AI/ML security audit (ATLAS + AI RMF)
/security-audit pentest [scope]        # Authorized pentest planning and methodology
/security-audit pr [diff]              # PR security review before merge
/security-audit self                   # Self-audit: hooks, memory, MCP chain, deny list
```

## Self-Audit Checklist
When `/security-audit self` is invoked, check each item and report PASS / FAIL / WARN:

**Deny List** (`settings.json` must match security rules exactly):
- `Read(~/.ssh/**)` blocked
- `Read(~/.aws/**)` blocked
- `Read(**/.env*)` blocked
- `Write(~/.ssh/**)` blocked
- `Write(~/.aws/**)` blocked
- `Bash(curl * | bash)` blocked
- `Bash(curl * | sh)` blocked
- `Bash(ssh *)` blocked
- `Bash(scp *)` blocked
- `Bash(nc *)` blocked
- `Bash(* ANTHROPIC_BASE_URL=*)` blocked

**Hook Security** (hooks in `settings.json`):
- No outbound curl/wget calls
- No file writes to sensitive paths
- No exfiltration of env vars or context

**Memory Files** (`memory/` + `sdar/`):
- Regex scan for: `sk-`, `AKIA`, `ghp_`, `api.?key\s*=\s*\S{8,}`, `xox[baprs]-`
- No raw credentials anywhere in memory or skill bank

**MCP Chain** (user-level + project-level `settings.json`):
- Count enabled MCP servers (prefer 0 when not in active use)
- Scan each server config for `ANTHROPIC_BASE_URL` overrides
- Scan for `enableAllProjectMcpServers` flags

**Secrets Handling**:
- Confirm a secrets manager (e.g., a CLI secrets manager / .env) is the retrieval method for any API keys in use
- Confirm no `.env` files exist in project root

**CVE Awareness**:
- CVE-2025-59536 (Claude Code 1.0.111+ patches hooks-before-trust-dialog)
- CVE-2026-21852 (Claude Code 2.0.65+ patches ANTHROPIC_BASE_URL key leak)

**Skill Bank Attribution**:
- Every session log entry must have `session_id`, `timestamp`, `agent` fields

## Output Format
```markdown
# Security Audit: [Target], [Date]

## Risk Summary
Overall: [Critical / High / Medium / Low]
Findings: [N] total | [X] critical | [Y] high | [Z] medium

## Findings
### [CRIT-001] [Title]
- Framework: MITRE ATT&CK T1234 | NIST CSF ID.AM-02
- Description: [what the vulnerability is]
- Evidence: [specific file:line or config]
- Impact: [what an attacker can do]
- Fix: [exact remediation steps]
- Effort: [Low / Medium / High]

## Threat Model
Attack surface → attack vectors → mitigations mapped

## Recommended Actions (prioritized)
1. [Immediate, fix before next deploy]
2. [Short-term, fix this sprint]
3. [Long-term, architecture change]

## Framework Coverage
[Which MITRE/NIST controls are satisfied vs gaps]
```

## OWASP Top 10 Quick Reference
Automatically checked in code mode:
1. Injection (SQL, command, LDAP)
2. Broken Authentication
3. Sensitive Data Exposure
4. XML External Entity (XXE)
5. Broken Access Control
6. Security Misconfiguration
7. Cross-Site Scripting (XSS)
8. Insecure Deserialization
9. Using Components with Known Vulnerabilities
10. Insufficient Logging & Monitoring
