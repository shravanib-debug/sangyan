/** Associated data binding an encrypted push subscription to its owner. */
export function pushAad(userId: string): string {
  return `push:${userId}`;
}
