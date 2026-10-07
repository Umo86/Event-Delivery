// Small text helpers shared by server actions, emails and pages. No server-only imports, so they can be unit tested.

/** "A", "A and B", "A, B and C", or "A, B, C and 2 more" for long lists. */
export function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length <= 4) return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
}

/** "1 person", "3 people". */
export function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}
