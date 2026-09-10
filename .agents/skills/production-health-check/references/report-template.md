# Report template

Fill this exactly. Every claim must trace to a `VERDICT` line or captured
evidence — never assert something the collector did not observe. If a check
could not run, say so under **Not verified** rather than omitting it.

Produce the report as your chat reply, and offer to save it to a file. No
`###` headings — use **bold** labels and bullets, per the house style.

---

**Production Health Check — <YYYY-MM-DD HH:MM TZ>**

**Overall: <HEALTHY | DEGRADED | BROKEN>** — <one sentence: the single most
important thing a human needs to know>

**Scope:** host `<hostname>` (`<ip>`), commit `<sha> <subject>`, image built
`<date>`, checked from both the server (internal) and the operator network
(external). Read-only: nothing was modified.

**Summary:** `<n>` FAIL · `<n>` WARN · `<n>` PASS · `<n>` INFO

---

## Critical (FAIL) — fix before anything else

For each FAIL, in this shape:

- **`<check.id>` — <one-line symptom>**
  - **Evidence:** the exact log line / command output observed (quote it).
  - **Impact:** what is broken for users, or what will break and when.
  - **Likely cause:** the mechanism, referencing `references/failure-modes.md#<n>` when it matches.
  - **Fix:** the specific command(s) or code change. Flag any that are destructive or need a decision.

If there are no FAILs, say **"No critical findings."** — do not pad.

## Warnings (WARN) — degraded, not down

Bulleted, one line each: `<check.id>` — what it means and the trigger threshold.
Separate genuine risks from known-cosmetic noise (e.g. Caddy ACME NXDOMAIN,
`litellm` unhealthy, empty keyspace with no traffic) and label them as such.

## Verified healthy

Group the PASSes by area so the reader can see coverage, not a wall of rows.
Call out the high-value ones explicitly — migrations in sync, port 80 listening,
Redis auth enforced and correctly capped, both API bridges 200.

## Full check table

| Check | Status | Detail |
|---|---|---|
| `<id>` | `<PASS/WARN/FAIL/INFO>` | `<short detail>` |

Include every `VERDICT` line from the collector. This is the "missed nothing"
proof.

## Not verified / limitations

Be explicit and honest about the gaps, e.g.:

- Checks that could not run (container down so `exec` failed, tool absent, no permission).
- Anything requiring a real authenticated session (report that login is
  *reachable*, not that a credential pair *works* — this skill does not hold credentials).
- Load/concurrency behaviour, security posture, and data correctness — out of scope.
- If any check was skipped, name it and say why.

## Recommended actions

Ordered, most urgent first. Separate:

- **Now** — anything that will cause an outage or data loss.
- **Soon** — degradation to schedule.
- **Watch** — informational items worth a follow-up.

---

### Reminders for the author of the report

- Quote raw evidence for FAILs; a reader should be able to verify the claim.
- Never print secret **values** — presence, length and placeholder status only.
- Distinguish "the kernel/environment is wrong" from "the application is wrong".
- If the same root cause explains several FAILs, say so once and link them
  (e.g. backend crash-loop → Caddy never started → port 80 closed → Vercel 502
  is **one** incident, not four).
- State whether the public user-facing path (Vercel → origin) was proven
  end-to-end, or only the internal path.
