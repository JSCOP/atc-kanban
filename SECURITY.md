# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Current |
| < 0.2   | ❌         |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email **security@jscop.dev** with details (or open a [private security advisory](https://github.com/JSCOP/atc-kanban/security/advisories/new))
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix release**: As soon as possible, depending on severity

## Scope

ATC runs locally and does not handle authentication or remote connections by default. However, the following areas are in scope:

- SQL injection via API endpoints or MCP tools
- Path traversal in workspace/worktree operations
- Command injection via git operations
- Denial of service via resource exhaustion
- MCP tool input validation bypass

## Out of Scope

- Issues requiring physical access to the machine
- Social engineering attacks
- Vulnerabilities in upstream dependencies (report to the dependency maintainer)
