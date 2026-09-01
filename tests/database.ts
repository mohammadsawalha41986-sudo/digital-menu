/**
 * Whether the integration suites can reach a database — and whether being
 * unable to is allowed.
 *
 * The suites guard on this so they can be run on a laptop with no PostgreSQL.
 * That convenience has a failure mode: if the database is missing somewhere it
 * was *supposed* to exist, a third of the suite disappears and the run still
 * reports success. That is a silent skip, and it is how a green CI badge stops
 * meaning anything.
 *
 * So `REQUIRE_DATABASE=1` turns an unreachable database from a skip into a
 * loud failure. CI sets it. Nothing else needs to.
 */
export async function resolveDatabase(probe: () => Promise<unknown>): Promise<boolean> {
  const reachable = await probe().then(
    () => true,
    () => false,
  );

  if (!reachable && process.env.REQUIRE_DATABASE === '1') {
    throw new Error(
      'REQUIRE_DATABASE=1 but the database is unreachable. ' +
        'The integration suites would have skipped silently, which would report a ' +
        'partial run as a passing one. Check DATABASE_URL and that PostgreSQL is up.',
    );
  }

  return reachable;
}
