import YAML from "yaml";

/**
 * Deterministic YAML serialization for fulcrum on-disk files.
 *
 * Discipline (committed in plan):
 * - Alphabetical key order at every map level.
 * - One field per line (no flow-style maps or arrays in output).
 * - Trailing newline normalized (single \n at end).
 *
 * This keeps git diffs minimal and three-way merges predictable.
 */
export function fulcrumYamlStringify(value: unknown): string {
  const out = YAML.stringify(value, {
    sortMapEntries: true,
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });
  return out.endsWith("\n") ? out : out + "\n";
}
