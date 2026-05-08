import { describe, expect, test } from "bun:test";
import { parseStoryFile, serializeStoryFile } from "../../src/domain/markdown.ts";

describe("parseStoryFile", () => {
  test("parses a simple frontmatter + body", () => {
    const content = `---\nid: T-1042-7b21\ntype: feature\n---\n\nSome body text.\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value.frontmatter as Record<string, unknown>).id).toBe("T-1042-7b21");
    expect(result.value.body).toBe("Some body text.\n");
  });

  test("handles frontmatter with no body", () => {
    const content = `---\nid: T-1042-7b21\n---\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe("");
  });

  test("handles multi-line markdown body", () => {
    const content = `---\nid: T-1042-7b21\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toContain("Paragraph one.");
    expect(result.value.body).toContain("Paragraph two.");
  });

  test("rejects file without frontmatter delimiters", () => {
    const result = parseStoryFile("just a markdown body, no frontmatter\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_FRONTMATTER");
  });

  test("rejects file with malformed YAML in frontmatter", () => {
    const content = `---\nid: T-1042-7b21\nbroken: : :\n---\n\nbody\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_FRONTMATTER");
  });

  test("rejects file with frontmatter that is an array, not object", () => {
    const content = `---\n- one\n- two\n---\n\nbody\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_FRONTMATTER");
  });

  test("returns CONFLICT_PRESENT when 2-way conflict markers present", () => {
    const content = `---\nid: T-1042-7b21\n<<<<<<< ours\nstate: started\n=======\nstate: finished\n>>>>>>> theirs\n---\n\nbody\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("CONFLICT_PRESENT");
  });

  test("returns CONFLICT_PRESENT when 3-way diff3 markers present", () => {
    const content = `---\nid: T-1042-7b21\n<<<<<<< ours\nstate: started\n||||||| base\nstate: unstarted\n=======\nstate: finished\n>>>>>>> theirs\n---\n\nbody\n`;
    const result = parseStoryFile(content);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("CONFLICT_PRESENT");
  });
});

describe("serializeStoryFile", () => {
  test("produces deterministic alphabetical-key frontmatter + body", () => {
    const out = serializeStoryFile(
      { type: "feature", id: "T-1042-7b21", state: "unstarted" },
      "the description body",
    );
    // Expected shape:
    // ---
    // id: T-1042-7b21
    // state: unstarted
    // type: feature
    // ---
    //
    // the description body
    expect(out.startsWith("---\n")).toBe(true);
    const lines = out.split("\n");
    expect(lines[0]).toBe("---");
    // Keys appear alphabetically in the frontmatter
    const yamlBlock = out.slice(4, out.indexOf("\n---\n", 4));
    const yamlLines = yamlBlock.split("\n").filter((l) => /^[a-z_]+:/.test(l));
    const keys = yamlLines.map((l) => l.split(":")[0]);
    expect(keys).toEqual([...keys].sort());
    // Body is preserved
    expect(out).toContain("the description body");
    // Trailing newline normalized to single \n
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  test("round-trip: parse(serialize(x)) === x for simple frontmatter", () => {
    const fm = { id: "T-1042-7b21", state: "unstarted", type: "feature" };
    const body = "round-trip body\nmulti-line\n";
    const serialized = serializeStoryFile(fm, body);
    const parsed = parseStoryFile(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.frontmatter).toEqual(fm);
    expect(parsed.value.body).toBe("round-trip body\nmulti-line\n");
  });

  test("normalizes body: trailing newlines collapse to single \\n", () => {
    const out = serializeStoryFile({ id: "T-1042-7b21" }, "body\n\n\n\n");
    expect(out.endsWith("body\n")).toBe(true);
  });
});
