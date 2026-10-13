# Pull request merge governance

Status: proposal for repository-owner review. This document does not change GitHub repository settings and cannot by itself prevent a merge.

## Findings checked on 2026-10-13

- PR #43 (`feat(security): add Supabase login and admin authorization baseline`) was merged at 2026-10-12T01:06:53Z.
- PR #44 (`fix(test): correct auth integration header typings`) was merged at 2026-10-12T05:14:15Z.
- PR #45 (`test(security): cover missing token and auth provider outage`) was merged at 2026-10-13T01:37:59Z.
- The available review records for these PRs show a `COMMENTED` review with body `Approved`, authored by the PR author. A comment is not an `APPROVED` review state.
- The repository's `.github/workflows/ci.yml` defines `pull_request` and `push` CI jobs for verification and interoperability. No auto-merge workflow was found among the common workflow paths checked.
- CI for the latest desktop test commit completed successfully: run 38332935924 (verify and interoperability jobs).

These observations do not prove the exact trigger for the merges. The available connector response did not expose the repository's branch-protection/ruleset settings or an authoritative auto-merge flag. A repository owner should inspect GitHub's audit log, pull request timeline, repository rulesets, branch protection, and any external GitHub App/automation before attributing the cause.

## Recommended repository controls

Configure these controls in GitHub repository settings or organization rulesets; this file is guidance only:

1. Protect `main` and require pull requests for all changes.
2. Require at least one approval from someone other than the PR author; dismiss stale approvals when new commits are pushed.
3. Require the `verify` and `interoperability` CI checks to pass before merge.
4. Disable auto-merge unless explicitly approved by the repository owner and documented for the specific PR.
5. Restrict who can bypass branch protections/rulesets and audit every bypass.
6. Review installed GitHub Apps, Actions permissions, and external automations that can merge pull requests.
7. Do not treat a comment containing “Approved” as a formal review approval.

## Desktop authentication test correction

The header-type correction is already present on `main` in PR #44, and the follow-up negative cases are present in PR #45. Do not duplicate those code changes. This PR records the merge-governance findings and required controls; it does not modify application code, change repository settings, merge, or deploy.
