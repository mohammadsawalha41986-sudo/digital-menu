/**
 * Runs once when the server starts. Only the one-off storage copy lives here,
 * and only on the Node.js runtime; it is a no-op unless a deploy asks for it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startCopyFromLocalIfAsked } = await import('./server/storage');
  startCopyFromLocalIfAsked();
}
