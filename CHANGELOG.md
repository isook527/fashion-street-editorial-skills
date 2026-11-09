# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.1] - 2026-11-09

### Added

- Redacted Codex evaluation answers, rubric scores, and a consistency check.

### Changed

- Upgraded sharp from 0.34.5 to 0.35.5. The jacket demo cover PNG matches byte for byte in the [controlled render comparison](docs/validation.md#sharp-0355).
- Raised the minimum Node.js version to 22.
- Test CI runs Node.js 22 and 24 on Ubuntu and macOS. The release workflow uses Node.js 24.
- Upgraded GitHub Actions to checkout v7, setup-node v7, and cache v6. Dependabot groups future Actions updates into one PR.

### Fixed

- A preview preflight checks the first-page sample without treating missing final pages as errors or enabling delivery.

## [0.6.0] - 2026-11-09

### Added

- A standalone generation handoff and review checkpoints for briefs and pilots.
- Draft 2020-12 schemas, project scaffolding, and validation that reports field errors together.
- Copy risk checks with a community-editable vocabulary and an optional strict mode.
- A bilingual trigger set, five evaluation tasks, and a scoring guide.
- Package checks, platform-matrix CI, and GitHub Release asset automation.
- A starter project walkthrough, contribution and security guidance, and GitHub issue forms.

### Fixed

- Copy lint exempts common neutral phrases and reports the original position of each hit.
- Layout instructions describe the page-order approval and cover export filenames.

### Changed

- The English and Chinese READMEs document installation on Claude Code, Claude.ai, and Codex.
- Both skill entrypoints document the workflow, deliverables, and content boundaries.
- Documentation images and the repository social preview carry a visible AI-generated label.
- Optional CJK fonts are fetched on demand and checked against pinned SHA-256 hashes.
- Layout can export SVG when sharp is unavailable. Raster checks explain how to enable them.
- Version 1 project semantics and the existing 24 template IDs are retained.

## [0.5.0] - 2026-11-09

### Added

- Creative briefs, nine-shot rhythm, outfit and motion guidance, and color grading references.
- Four additional layouts, three export presets, cover checks, and CJK rendering support.
- Publishing copy, garment color comparison, per-shot repair history, and disclosure tracking.
- Performance feedback fields and cover A/B comparison.
