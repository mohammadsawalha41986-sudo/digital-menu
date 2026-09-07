'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { duplicateMenuAction } from '@/server/admin/structure-actions';
import type { ActionState } from '@/server/admin/actions';

interface MenuRow {
  id: string;
  key: string;
  title: string;
  status: string;
  published: boolean;
  categories: number;
  items: number;
}

interface BranchRow {
  key: string;
  title: string;
}

/**
 * Copies text and says so.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be
 * refused by permissions policy, so the fallback is not decoration: without
 * it, an operator on `http://` gets a button that silently does nothing. The
 * textarea is selectable in every case, so the manual path always exists.
 */
function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <button
      type="button"
      className="admin__button admin__button--secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState('copied');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2000);
      }}
      aria-live="polite"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label}
    </button>
  );
}

function LinkRow({ label, url, hint }: { label: string; url: string; hint?: string }) {
  return (
    <li className="admin__share-row">
      <span className="admin__share-label">{label}</span>
      <a className="admin__share-url" href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      {hint ? <span className="admin__hint">{hint}</span> : null}
      <span className="admin__share-actions">
        <CopyButton value={url} label="Copy link" />
      </span>
    </li>
  );
}

/**
 * The embed snippet.
 *
 * An iframe alone leaves the host with a fixed-height box and an inner
 * scrollbar — the thing that makes an embedded menu feel like an embedded
 * menu. The snippet therefore ships with the ten lines that listen for the
 * height the frame posts and resize to it.
 *
 * The listener checks `event.source` against the frame's own window, so a
 * different frame on the host's page cannot resize this one, and reads only a
 * bounded number. That check is the reason to give people a snippet at all
 * rather than let everyone invent their own.
 */
function embedSnippet(url: string, title: string): string {
  const id = `dm-${Math.random().toString(36).slice(2, 8)}`;

  return `<iframe
  id="${id}"
  src="${url}"
  title="${title.replace(/"/g, '&quot;')}"
  loading="lazy"
  style="width:100%;border:0;display:block;height:900px"
  referrerpolicy="no-referrer-when-downgrade"
></iframe>
<script>
  (function () {
    var frame = document.getElementById('${id}');
    window.addEventListener('message', function (event) {
      if (!frame || event.source !== frame.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== 'digital-menu:height') return;
      var height = Number(data.height);
      if (height > 0 && height < 20000) frame.style.height = height + 'px';
    });
  })();
</script>`;
}

function EmbedBlock({ url, title }: { url: string; title: string }) {
  const snippet = embedSnippet(url, title);

  return (
    <div className="admin__embed">
      <div className="admin__embed-head">
        <span className="admin__share-label">Embed on a website</span>
        <CopyButton value={snippet} label="Copy embed code" />
      </div>
      <textarea className="admin__embed-code" readOnly rows={8} value={snippet} spellCheck={false} />
      <p className="admin__hint">
        Paste into any page — WordPress (a Custom HTML block), Shopify, Webflow, or plain HTML. The
        frame reports its own height, so the menu grows with its content instead of scrolling inside
        a box.
      </p>
    </div>
  );
}

function DuplicateMenu({ businessId, menuId }: { businessId: string; menuId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(duplicateMenuAction, {});

  return (
    <form action={formAction} className="admin__share-actions">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="menuId" value={menuId} />
      <button type="submit" className="admin__button admin__button--secondary">
        Duplicate menu
      </button>
      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok && state.message ? (
        <span className="admin__message admin__message--ok" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function SharePanel({
  businessId,
  publicId,
  businessName,
  base,
  menus,
  branches,
}: {
  businessId: string;
  publicId: string;
  businessName: string;
  base: string;
  menus: MenuRow[];
  branches: BranchRow[];
}) {
  const profileUrl = `${base}/m/${publicId}`;

  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">The whole profile</h2>
        <p className="admin__hint">
          Every menu this business publishes, on one page. This address never changes — not when
          prices change, not when the template changes — which is what makes a printed QR safe.
        </p>

        <ul className="admin__share-list">
          <LinkRow label="Public link" url={profileUrl} />
          {branches.map((branch) => (
            <LinkRow
              key={branch.key}
              label={`Branch — ${branch.title}`}
              url={`${profileUrl}/b/${branch.key}`}
              hint="Its own permanent QR, with this branch's prices and details."
            />
          ))}
        </ul>

        <EmbedBlock url={`${base}/embed/${publicId}`} title={businessName} />
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">One menu at a time</h2>
        <p className="admin__hint">
          Each menu has an address of its own: its own QR for its own table tent, its own link to
          send, and its own embed for the page that should show that menu and nothing else.
        </p>

        {menus.length === 0 ? (
          <p className="admin__hint">
            No menus yet. Create one from the Menus screen, then come back for its link.
          </p>
        ) : (
          <ul className="admin__share-menus">
            {menus.map((menu) => {
              const url = `${profileUrl}/menu/${menu.key}`;

              return (
                <li key={menu.id} className="admin__share-menu" data-menu={menu.key}>
                  <div className="admin__share-menu-head">
                    <h3 className="admin__share-menu-title">{menu.title}</h3>
                    <span
                      className="admin__link-state"
                      data-state={menu.published ? 'WORKING' : 'UNCHECKED'}
                    >
                      {menu.published ? 'Published' : 'Not published'}
                    </span>
                    <span className="admin__hint">
                      {menu.categories} section{menu.categories === 1 ? '' : 's'} · {menu.items} item
                      {menu.items === 1 ? '' : 's'}
                    </span>
                  </div>

                  {menu.published ? (
                    <>
                      <ul className="admin__share-list">
                        <LinkRow label="Menu link" url={url} />
                      </ul>
                      <EmbedBlock url={`${base}/embed/${publicId}/menu/${menu.key}`} title={menu.title} />
                    </>
                  ) : (
                    <p className="admin__hint">
                      This menu has no published version yet, so its link would show nothing.
                      Publish it from the Menus screen first.
                    </p>
                  )}

                  <DuplicateMenu businessId={businessId} menuId={menu.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
