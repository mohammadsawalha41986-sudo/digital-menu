/**
 * Runs once when the server starts. Only the one-off storage copy lives here,
 * and only on the Node.js runtime; it is a no-op unless a deploy asks for it.
 * Nothing here may stop the server from starting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { startCopyFromLocalIfAsked } = await import('./server/storage');
    startCopyFromLocalIfAsked();
  } catch (error) {
    console.error('STORAGE_COPY_NOT_STARTED', error instanceof Error ? error.message : error);
  }
}
