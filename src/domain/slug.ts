/**
 * Slugify a story title for use in a filename.
 *
 * Lowercase, ASCII alphanumeric + dash, max 60 chars. Filenames stay grep-friendly
 * (per plan's resolved decision: "1043-slug.md" beats "1043.md with title in
 * frontmatter").
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length === 0) return "story";
  return base.length > 60 ? base.slice(0, 60).replace(/-+$/, "") : base;
}
