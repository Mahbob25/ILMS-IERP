# Taste

- Prefers ref-based guards (useRef) over state-based guards (useState) for preventing double-submission, because refs are synchronous and eliminate the render gap where a second click can slip through. Confidence: 0.7
- Prefers surfacing backend error details (e.g., the `detail` field from the response body) to provide users with specific, actionable error messages rather than swallowing them behind a generic fallback. Confidence: 0.7
- When fixing a bug, proactively searches the codebase for similar patterns (e.g., same `setSubmitting` anti-pattern) and applies the fix holistically rather than only patching the reported instance. Confidence: 0.6
- Verifies edits by reading back modified files after applying changes, especially after multi-step edits that could accidentally drop intermediate lines. Confidence: 0.5
