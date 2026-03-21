# Phase 7 Safety Audit — Optimization Review

## Evaluation Table

| Optimization | Status | Reason |
|---|---|---|
| `stalledInterval` 60s → 120s | ✅ SAFE | Adds ≤60s recovery delay for truly crashed jobs; harmless for all normal flows |
| `guardInterval` 30s → 60s | ✅ SAFE | Only affects `delayed`-state job promotion; no impact on queued email/moderation jobs |
| Remove idempotency `DONE` SET XX | ❌ REJECTED | **Loses ability to distinguish crashed-before-send from successfully completed jobs. Breaks post-mortem debugging and crash diagnostics.** |
| Skip empty `addTags` calls | ✅ SAFE | Call site audit confirmed tags are never empty; no code required |
| Batch `invalidateTags` co-occurrences | ✅ N/A | Call site audit confirmed each occurs in a different code path; no batching applicable |

---

## Critical Finding: `DONE` State Removal is Unsafe

### Why it was proposed
The `DONE` write (a `SET XX EX` after the email is dispatched) was proposed for removal because the `LOCKED` state alone prevents re-execution. This is **correct for deduplication**.

### Why it is rejected

The `LOCKED` value creates an unresolvable ambiguity during any crash investigation:

| Key State | Possible Meanings |
|---|---|
| Key missing | Job has never run, OR the 7-day TTL lapsed |
| Key = `LOCKED` | **(AMBIGUOUS)** Worker is currently mid-execution, OR worker crashed after locking but before sending, OR email was sent successfully (with DONE removed) |
| Key = `DONE` | Email was definitively sent |

Without `DONE`, when a user reports "I didn't receive my email," there is no way to determine from Redis whether the payload was delivered or silently dropped mid-crash. This is a critical observability gap in a **production email system** where support staff and engineers need to investigate delivery failures rapidly.

**In a crash-recovery scenario:** the system correctly drops the re-queued job (good). But there is no audit trail to confirm the original job succeeded before the crash. This transforms diagnosable crashes into permanently ambiguous ones.

### Safe Corrected Version (no command reduction for this optimization)

Restore the `SET XX` write post-send. The two-command pattern (`SET NX` + `SET XX`) is the correct minimum for safe idempotency with observability. The cost is ~200K commands/month — a worthwhile correctness price.

---

## Final Approved Optimization Plan

### Apply now (✅ already in `queue.config.js`):
- `stalledInterval: 120000` ✅
- `guardInterval: 60000` ✅

### Revert immediately (❌ applied but rejected):
- Restore `DONE` SET XX write in `emailWorker.js`

---

## Conservative Command Reduction Estimate

| Change | Commands Saved/Month |
|---|---|
| `stalledInterval` doubled | ~650K |
| `guardInterval` doubled | ~1.1M |
| **Total** | **~1.75M/month** |

The `DONE` removal (~200K/month) is **off the table**. The corrected total is ~1.75M/month, representing a **~33% further reduction** on top of Phase 2/3 gains. Cumulative reduction vs original 9.4M baseline is ~85%.
