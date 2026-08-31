'use client';

import { useActionState, useState } from 'react';
import type { ReviewState } from './actions';

/**
 * The review bar, and nothing else, sits above the real profile.
 *
 * It is deliberately not styled with the business's brand tokens: it is the
 * agency talking, not the business, and a client must be able to tell the
 * difference between the page under review and the controls reviewing it.
 */
export function ReviewBar({
  businessName,
  state,
  action,
}: {
  businessName: string;
  state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  action: (previous: ReviewState, formData: FormData) => Promise<ReviewState>;
}) {
  const [result, formAction] = useActionState<ReviewState, FormData>(action, {});
  const [asking, setAsking] = useState(false);

  const settled = result.ok || state !== 'PENDING';

  return (
    <div className="review" dir="ltr">
      <div className="review__inner">
        <div>
          <p className="review__title">Preview for approval — {businessName}</p>
          <p className="review__note">
            This is not yet live. Nothing here is visible to the public.
          </p>
        </div>

        {result.error ? (
          <p className="review__message review__message--error" role="alert">
            {result.error}
          </p>
        ) : null}

        {settled ? (
          <p className="review__message review__message--ok" role="status">
            {result.message ??
              (state === 'APPROVED'
                ? 'Approved. Thank you.'
                : 'Your notes have been sent to the team.')}
          </p>
        ) : (
          <form action={formAction} className="review__form">
            {asking ? (
              <>
                <label className="review__field">
                  <span>What would you like changed?</span>
                  <textarea
                    name="note"
                    rows={4}
                    required
                    className="review__textarea"
                    placeholder="For example: the burger should be 45, and please use the new logo."
                  />
                </label>
                <label className="review__field">
                  <span>Your name (optional)</span>
                  <input name="name" className="review__input" />
                </label>
                <div className="review__actions">
                  <button
                    type="submit"
                    name="decision"
                    value="changes"
                    className="review__button"
                  >
                    Send notes
                  </button>
                  <button
                    type="button"
                    className="review__button review__button--quiet"
                    onClick={() => setAsking(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="review__actions">
                <label className="review__field review__field--inline">
                  <span>Your name (optional)</span>
                  <input name="name" className="review__input" />
                </label>
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  className="review__button review__button--primary"
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="review__button"
                  onClick={() => setAsking(true)}
                >
                  Request a change
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
