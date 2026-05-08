---
created: 2026-05-08
icebox: false
id: T-1035-397e
labels: []
points: 2
position: aY
state: unstarted
type: feature
---

# Columns share one background color (vintage PT visual revisit)

NOTE: this revisits a load-bearing decision in DESIGN.md.

Current design thesis: "PT-saturated column tints (Current=yellow, Backlog=sky, Icebox=lavender) as load-bearing semantic landmarks. Modern PM tools (Linear, Notion) dropped this in favor of pure-white columns + chips, which is **inferior** for at-a-glance density."

User feedback during iteration 1 close: "all three columns should be the same background color (I think this is how vintage PT was)."

Pivotal Tracker 2014-2018 screenshots show the columns DID carry distinct tints. Before implementing, verify against actual vintage PT screenshots and either:
  (a) keep DESIGN.md's column-tint thesis and reject this story, or
  (b) revise DESIGN.md's "Eureka principle" section to drop the column-color semantic and unify backgrounds.

Decision must be explicit and recorded in DESIGN.md's Decisions Log either way.
