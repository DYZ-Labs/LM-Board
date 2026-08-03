# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.
Report them privately using
[GitHub private vulnerability reporting](https://github.com/DYZ-Labs/LM-Board/security/advisories/new).

Include reproduction steps, the affected URL or commit, the potential impact,
and any suggested remediation. We will coordinate disclosure after a fix is
available.

## Build-time dependency audit

The 2026-08-03 Next.js 16.2.12 migration was checked with both `npm audit` and
`npm audit --omit=dev`. The production-dependency report retains high-severity
advisories inherited through Next's bundled PostCSS 8.4.31 and optional Sharp
0.34.5; the full report also includes a `brace-expansion` advisory in ESLint's
development-only glob stack. The installed Next release is the newest compatible
stable 16.x release, and npm currently offers no compatible remediation.

LM Board deploys only the files produced by `output: "export"`. No Next server,
request-time CSS compiler, image optimizer, or Sharp process is deployed, and CI
builds only repository-controlled CSS, images, and source maps. The unresolved
paths are therefore build-only exposure to trusted inputs, not reachable
production request handlers. Do not force transitive overrides that Next does
not support; update the owning packages when compatible patched releases ship
and rerun both audit commands.
