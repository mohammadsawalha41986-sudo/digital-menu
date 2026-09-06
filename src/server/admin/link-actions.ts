'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import { checkLinks } from '@/server/links/service';
import { RULES, consume } from '@/server/security/rate-limit';
import type { ActionState } from './actions';

/**
 * Runs Link Health for one business.
 *
 * Rate-limited per business rather than per user. The cost of this action is
 * outbound requests to third parties, and the party who notices is the
 * *target*: a form that can be resubmitted freely is a way to point the
 * platform's traffic at someone else's server. One run a minute is more than
 * an operator needs and far less than an amplifier.
 */
export async function checkLinksAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  if (!businessId) return { error: 'No business.' };

  const limit = consume(RULES.linkCheck, businessId);

  if (limit.limited) {
    const seconds = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    return { error: `Links were just checked. Try again in ${seconds}s.` };
  }

  try {
    const rows = await checkLinks(user, businessId);

    revalidatePath(`/admin/businesses/${businessId}/health`);
    revalidatePath(`/admin/businesses/${businessId}`);
    revalidatePath('/admin');

    if (rows.length === 0) return { ok: true, message: 'No external links to check.' };

    const broken = rows.filter((row) => row.status === 'BROKEN').length;
    const blocked = rows.filter((row) => row.status === 'BLOCKED').length;

    if (broken === 0 && blocked === 0) {
      return { ok: true, message: `Checked ${rows.length} link${rows.length === 1 ? '' : 's'} — all reachable.` };
    }

    const parts = [
      broken > 0 ? `${broken} broken` : null,
      blocked > 0 ? `${blocked} refused` : null,
    ].filter(Boolean);

    return { ok: true, message: `Checked ${rows.length}: ${parts.join(', ')}.` };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}
