## Summary

<!-- One to three bullets on what this PR changes and why. -->

- 
- 

## Type of change

- [ ] Bug fix
- [ ] New skill
- [ ] New or updated rule / operating pattern
- [ ] Docs / CHANGELOG update
- [ ] Pipeline / CI improvement
- [ ] Security fix (if so, was this coordinated via private advisory first?)

## Checklist

### Content safety
- [ ] No personal data in any file (real names, emails, API keys, financial data, private paths)
- [ ] No third-party skills vendored directly, external skills are referenced by link
- [ ] Injection-safety preamble present in any new AGENTS.md section or SKILL.md

### Skill files (if applicable)
- [ ] Valid YAML frontmatter with `name`, `description`, `allowed-tools`
- [ ] `allowed-tools` is least-privilege (no unnecessary Write/Bash if the skill only needs to read)
- [ ] Skill file under 500 lines; larger content uses progressive disclosure with linked supporting files
- [ ] No model escalation without a documented reason in frontmatter

### Prose
- [ ] Humanizer-clean: no "delve into", "it's important to note", "furthermore", "Certainly!", em-dash overuse
- [ ] Specific over vague: numbers beat adjectives where relevant
- [ ] No AI tells or filler openers

### CI
- [ ] Local injection-safety check passed (`bash scripts/check-injection.sh`)
- [ ] No hidden unicode characters introduced (`rg -nP '[\x{200B}-\x{200D}\x{FEFF}\x{202A}-\x{202E}]'` returns clean)

## Testing

<!-- How did you verify this works? For skills: what prompt triggered it correctly? For pipeline changes: what did you run? -->

## Related issues

Closes #
