export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  const parts = content.split("---");
  if (parts.length < 3) {
    return { frontmatter: {}, body: content };
  }

  return {
    frontmatter: {},
    body: parts.slice(2).join("---").trim(),
  };
}
