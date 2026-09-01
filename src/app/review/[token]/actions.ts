'use server';

import { revalidatePath } from 'next/cache';
import { respondToPreview } from '@/server/review/service';
import { ValidationError } from '@/server/admin/business-service';

export interface ReviewState {
  ok?: boolean;
  message?: string;
  error?: string;
}

/**
 * The client's response.
 *
 * No authentication, by design: the link *is* the credential, and requiring an
 * account is exactly what §139 rules out. The token is bound as an argument
 * rather than read from the form, so a crafted post cannot answer on behalf of
 * a different link.
 */
export async function respondAction(
  token: string,
  _previous: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const approve = formData.get('decision') === 'approve';
  const note = typeof formData.get('note') === 'string' ? (formData.get('note') as string) : '';
  const name = typeof formData.get('name') === 'string' ? (formData.get('name') as string) : '';

  try {
    const result = await respondToPreview(token, { approve, note, name });

    if (!result) return { error: 'This link is no longer valid.' };

    revalidatePath(`/review/${token}`);

    return {
      ok: true,
      message: result.approved
        ? 'Thank you — your approval has been recorded.'
        : 'Thank you — your notes have been sent to the team.',
    };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    console.error('[review] response failed', error);
    return { error: 'Something went wrong. Please try again.' };
  }
}
