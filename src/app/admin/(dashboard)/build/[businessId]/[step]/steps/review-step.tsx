'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { publishProjectAction, saveDraftAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Step 10 — review, then the one deliberate act that makes it public.
 *
 * The summary counts what actually exists rather than congratulating the
 * owner: an empty menu says so, and publishing is refused until there is
 * something to publish.
 */
export function ReviewStep({
  businessId,
  summary,
  publicUrl,
  publicPath,
  published,
  logoUrl,
}: {
  businessId: string;
  summary: {
    name: string;
    style: string;
    categories: number;
    items: number;
    photos: number;
    priced: number;
  };
  publicUrl: string;
  publicPath: string;
  published: boolean;
  logoUrl: string | null;
}) {
  const [publishState, publish] = useActionState<ActionState, FormData>(publishProjectAction, {});
  const [draftState, saveDraft] = useActionState<ActionState, FormData>(saveDraftAction, {});

  const ready = summary.items > 0;

  return (
    <div className="build__stack">
      <section className="build__card">
        <h2 className="build__step-title">
          {published ? 'Your menu is live' : 'Your menu is ready'}
        </h2>

        <div className="build__review">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="build__review-logo" src={logoUrl} alt="" />
          ) : null}

          <dl className="build__facts">
            <div>
              <dt>Restaurant</dt>
              <dd>{summary.name}</dd>
            </div>
            <div>
              <dt>Style</dt>
              <dd>{summary.style}</dd>
            </div>
            <div>
              <dt>Sections</dt>
              <dd>{summary.categories}</dd>
            </div>
            <div>
              <dt>Dishes</dt>
              <dd>{summary.items}</dd>
            </div>
            <div>
              <dt>With a photo</dt>
              <dd>
                {summary.photos} of {summary.items}
              </dd>
            </div>
            <div>
              <dt>With a price</dt>
              <dd>
                {summary.priced} of {summary.items}
              </dd>
            </div>
            <div>
              <dt>Public link</dt>
              <dd>
                <code>{publicUrl}</code>
              </dd>
            </div>
          </dl>
        </div>

        {!ready ? (
          <p className="admin__message admin__message--error" role="status">
            There are no dishes yet. Add at least one before publishing.
          </p>
        ) : null}
      </section>

      <section className="build__card">
        {publishState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {publishState.error}
          </p>
        ) : null}
        {publishState.ok && publishState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {publishState.message}
          </p>
        ) : null}
        {draftState.ok && draftState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {draftState.message}
          </p>
        ) : null}

        <div className="build__actions build__actions--split">
          <form action={saveDraft}>
            <input type="hidden" name="businessId" value={businessId} />
            <button type="submit" className="admin__button admin__button--secondary">
              Save draft
            </button>
          </form>

          <a className="admin__button admin__button--secondary" href={`/admin/preview/${businessId}`} target="_blank" rel="noreferrer">
            Preview menu
          </a>

          <form action={publish}>
            <input type="hidden" name="businessId" value={businessId} />
            <PublishButton label={published ? 'Publish changes' : 'Publish menu'} disabled={!ready} />
          </form>
        </div>

        {published ? (
          <div className="build__actions">
            <a className="admin__button" href={publicPath} target="_blank" rel="noreferrer">
              View live menu
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PublishButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="admin__button build__cta" disabled={pending || disabled}>
      {pending ? 'Publishing…' : label}
    </button>
  );
}
