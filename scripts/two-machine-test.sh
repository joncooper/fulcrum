#!/usr/bin/env bash
# Two-machine integration test (per design doc Testing Strategy).
#
# Simulates two collaborators editing different stories on different
# clones, pushing and pulling, and verifying no data loss.
#
# Exits 0 on success, non-zero with diagnostic output on failure.
#
# Run from the repo root:
#   scripts/two-machine-test.sh

set -euo pipefail

FULCRUM_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."; pwd)/bin/fulcrum"

TMP=$(mktemp -d -t fulcrum-2machine-XXXXXX)
trap "rm -rf $TMP" EXIT

BARE="$TMP/bare.git"
ALICE="$TMP/alice"
BOB="$TMP/bob"

echo "=== Two-machine test working in $TMP ==="

# 1. Create a bare repo (the "remote") and two clones (the "machines").
git init --bare --quiet "$BARE"
git clone --quiet "$BARE" "$ALICE"
git clone --quiet "$BARE" "$BOB"
( cd "$ALICE" && git config user.email "alice@test" && git config user.name "Alice" )
( cd "$BOB"   && git config user.email "bob@test"   && git config user.name "Bob"   )

# 2. Alice inits fulcrum and pushes.
( cd "$ALICE"
  bun run "$FULCRUM_BIN" init test >/dev/null
  bun run "$FULCRUM_BIN" new feature "Alice's first feature" --points 3 >/dev/null
  bun run "$FULCRUM_BIN" new feature "Alice's second feature" --points 5 >/dev/null
  git add . && git commit --quiet -m "alice: seed"
  git push --quiet origin master 2>/dev/null || git push --quiet origin HEAD:main
)

# 3. Bob pulls Alice's seed.
( cd "$BOB"
  git pull --quiet origin main 2>/dev/null || git pull --quiet origin master
  count=$(ls .fulcrum/stories | wc -l | tr -d ' ')
  if [ "$count" -ne 2 ]; then echo "FAIL: Bob should see 2 stories, got $count"; exit 1; fi
)

echo "Step 1 OK: Alice seeded 2 stories, Bob pulled them"

# 4. Alice edits one story, Bob edits the OTHER. Each pushes.
( cd "$ALICE"
  bun run "$FULCRUM_BIN" start 1001 >/dev/null
  git add . && git commit --quiet -m "alice: start 1001"
  git push --quiet origin HEAD
)
( cd "$BOB"
  git pull --quiet --rebase origin main 2>/dev/null || git pull --quiet --rebase origin master
  bun run "$FULCRUM_BIN" start 1002 >/dev/null
  git add . && git commit --quiet -m "bob: start 1002"
  git push --quiet origin HEAD
)

# 5. Alice pulls Bob's change.
( cd "$ALICE"
  git pull --quiet --rebase origin main 2>/dev/null || git pull --quiet --rebase origin master
  # Verify both stories are in their respective started states
  state_1001=$(bun run "$FULCRUM_BIN" show 1001 --json 2>/dev/null | head -1 | grep -o '"state":"[^"]*"' || echo "")
  state_1002=$(bun run "$FULCRUM_BIN" show 1002 --json 2>/dev/null | head -1 | grep -o '"state":"[^"]*"' || echo "")
  # The CLI show doesn't support --json yet; just grep the file content.
  state_1001=$(grep '^state:' .fulcrum/stories/T-1001-*.md | head -1)
  state_1002=$(grep '^state:' .fulcrum/stories/T-1002-*.md | head -1)
  if [[ "$state_1001" != *"started"* ]]; then echo "FAIL: T-1001 state should be started, got: $state_1001"; exit 1; fi
  if [[ "$state_1002" != *"started"* ]]; then echo "FAIL: T-1002 state should be started, got: $state_1002"; exit 1; fi
)
echo "Step 2 OK: Alice + Bob edited different stories, merged cleanly, both states preserved"

# 6. Same-story conflict path. Alice rejects 1001, Bob delivers 1001. Conflict.
( cd "$ALICE"
  bun run "$FULCRUM_BIN" reject 1001 --reason "scope" >/dev/null
  git add . && git commit --quiet -m "alice: reject 1001"
  git push --quiet origin HEAD
)
( cd "$BOB"
  bun run "$FULCRUM_BIN" finish 1001 >/dev/null
  bun run "$FULCRUM_BIN" deliver 1001 >/dev/null
  git add . && git commit --quiet -m "bob: deliver 1001"
  # Try to push — should fail (Alice pushed first)
  if git push --quiet origin HEAD 2>/dev/null; then
    echo "FAIL: Bob's push should have been rejected (Alice pushed first)"
    exit 1
  fi
  # Pull, expect conflict
  if git pull --quiet --rebase origin main 2>/dev/null || git pull --quiet --rebase origin master 2>/dev/null; then
    echo "FAIL: rebase should have surfaced a conflict on T-1001"
    exit 1
  fi
  # Verify conflict markers are in the file
  if ! grep -q "<<<<<<<" .fulcrum/stories/T-1001-*.md; then
    echo "FAIL: conflict markers not found in T-1001"
    exit 1
  fi
  # Abort the rebase to clean up
  git rebase --abort
)
echo "Step 3 OK: same-story conflict surfaced via standard git, not silently merged"

echo ""
echo "=== TWO-MACHINE TEST: PASS ==="
echo "Atomic writes + CAS-on-hash + deterministic YAML serialization mean:"
echo "  - Different-story edits merge cleanly with no data loss."
echo "  - Same-story conflicts surface via git's standard machinery."
echo "  - fulcrum doctor + git status will surface conflicts for the user."
