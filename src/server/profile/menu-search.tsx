'use client';

import { useEffect } from 'react';

/**
 * Search and filter, on the visitor's side of the menu.
 *
 * A café with a dozen dishes does not need this. A hotel with a hundred and
 * forty across nine sections is unusable without it: the visitor is standing
 * up, holding a phone, looking for one thing.
 *
 * **Why this builds DOM instead of rendering it.** The menu is server-rendered
 * by one of ten template families, and the search box belongs immediately
 * above the first section — a position none of those families has a slot for.
 * Rendering it here and moving it, or shipping it as an inline script, both
 * failed for the same underlying reason: React owns that subtree. An inline
 * `<script>` is hoisted and de-duplicated by React 19, which executed it twice
 * and reported hydration error #418; a node moved into a React-managed parent
 * before hydration is treated as a mismatch and removed again.
 *
 * An effect runs *after* hydration, exactly once, and React never reconciles
 * what it inserts. That is the whole reason for the shape of this file.
 *
 * It filters rather than fetches: the menu is already in the document, and a
 * round trip per keystroke would be slower, would need a network the visitor
 * may not have, and would put a search endpoint in front of every public
 * profile for nothing.
 *
 * It is template-agnostic: all ten families already mark rows `data-item` and
 * sections `data-category`, so a new family costs nothing here.
 */

export interface MenuSearchStrings {
  label: string;
  placeholder: string;
  clear: string;
  none: string;
  one: string;
  manySuffix: string;
}

/**
 * Folds Arabic before matching.
 *
 * Diacritics, tatweel, and the several forms of alef, ya and ta marbuta are
 * normalised on both sides, so a visitor typing "شاورما" finds "شَاوِرما" —
 * which is how menu text is often authored.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function MenuSearch({ strings }: { strings: MenuSearchStrings }) {
  useEffect(() => {
    const first = document.querySelector('[data-category]');
    if (!first?.parentNode) return;
    if (document.querySelector('[data-menu-search]')) return;

    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-item]'));
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-category]'));
    if (items.length === 0) return;

    const haystacks = items.map((element) => fold(element.textContent ?? ''));

    const box = document.createElement('div');
    box.className = 'menu-search';
    box.setAttribute('data-menu-search', '');

    const label = document.createElement('label');
    label.className = 'menu-search__label';
    label.htmlFor = 'menu-search-input';
    label.textContent = strings.label;

    const field = document.createElement('div');
    field.className = 'menu-search__field';

    const input = document.createElement('input');
    input.type = 'search';
    input.id = 'menu-search-input';
    input.className = 'menu-search__input';
    input.placeholder = strings.placeholder;
    input.autocomplete = 'off';
    input.enterKeyHint = 'search';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'menu-search__clear';
    clear.textContent = strings.clear;

    const status = document.createElement('p');
    status.className = 'menu-search__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    field.append(input, clear);
    box.append(label, field, status);
    first.parentNode.insertBefore(box, first);

    const apply = () => {
      const query = fold(input.value);
      let shown = 0;

      items.forEach((element, index) => {
        const match = query === '' || haystacks[index]!.includes(query);
        element.hidden = !match;
        if (match) shown += 1;
      });

      // A section whose every dish is filtered out becomes an empty heading,
      // which reads as a broken page rather than as a filter.
      for (const section of sections) {
        section.hidden = query !== '' && !section.querySelector('[data-item]:not([hidden])');
      }

      box.setAttribute('data-active', query === '' ? 'false' : 'true');
      status.textContent =
        query === ''
          ? ''
          : shown === 0
            ? strings.none
            : shown === 1
              ? strings.one
              : `${shown} ${strings.manySuffix}`;
    };

    const onClear = () => {
      input.value = '';
      input.focus();
      apply();
    };

    input.addEventListener('input', apply);
    clear.addEventListener('click', onClear);
    apply();

    return () => {
      input.removeEventListener('input', apply);
      clear.removeEventListener('click', onClear);
      box.remove();
      // Leave the menu as it was found: a filter that unmounts must not take
      // half the dishes with it.
      for (const element of items) element.hidden = false;
      for (const section of sections) section.hidden = false;
    };
  }, [strings]);

  return null;
}
