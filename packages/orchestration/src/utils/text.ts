export function truncate(text: string, max = 500): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}
