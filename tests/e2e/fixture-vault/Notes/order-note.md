---
zeta: 1
alpha: 2
mike: 3
bravo: 4
block: |
  line one
  line two
---

# Order note

Canary #2 fixture: processFrontMatter must preserve this top-level key order
(zeta, alpha, mike, bravo, block) and the block scalar after a value-only edit.
