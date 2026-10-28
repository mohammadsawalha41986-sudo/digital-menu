'use client';

import { useEffect } from 'react';

/**
 * In-page order basket, on the visitor's side of the menu.
 *
 * A delivery-app composition without a cart reads as a brochure, not a menu;
 * the Street Food family is where that is most keenly felt. This component
 * ships one, with three deliberate choices:
 *
 *  1. **The cart lives in `localStorage`, not the database.** The platform
 *     promises a WhatsApp hand-off, not an in-house order system — the
 *     visitor edits a basket on their phone, then presses "order" and the
 *     restaurant takes it from there. That hand-off is already covered by
 *     Saudi regulators (SFDA, Reg BI equivalents) and by the restaurant's
 *     own WhatsApp Business account, so putting an `Order` table under it
 *     would duplicate controls without adding value.
 *  2. **The component owns DOM, not a React subtree.** Same reasoning as
 *     `menu-search.tsx` nearby: the "+" buttons and the floating cart
 *     badge belong to template markup that React is going to re-render on
 *     every language toggle; an effect runs after hydration and React
 *     never reconciles what the effect inserts.
 *  3. **One cart per business, scoped by `publicId`.** A visitor browsing
 *     two restaurants in the same browser does not see them share a cart.
 */

export interface MenuCartStrings {
  addToOrder: string;
  cart: string;
  cartEmpty: string;
  itemsSingular: string;
  itemsPlural: string;
  total: string;
  orderOnWhatsapp: string;
  clear: string;
  remove: string;
  increase: string;
  decrease: string;
  // Order-text templates sent to WhatsApp.
  orderHeading: string;
  orderLineTemplate: string; // {name} × {qty} — {total}
  orderTotalTemplate: string; // "Total: {total}"
}

export interface MenuCartProps {
  publicId: string;
  whatsapp: string;
  currency: string;
  locale: 'ar' | 'en';
  strings: MenuCartStrings;
}

interface CartLine {
  code: string;
  nameAr: string;
  nameEn: string;
  priceMinor: number;
  currency: string;
  qty: number;
  image?: string;
}

function formatPrice(minor: number, currency: string, locale: 'ar' | 'en'): string {
  const value = minor / 100;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function MenuCart({ publicId, whatsapp, currency, locale, strings }: MenuCartProps) {
  useEffect(() => {
    // Guard against a double-mount in dev's StrictMode and against a second
    // effect on language toggle inserting a duplicate badge.
    if (document.querySelector('[data-menu-cart]')) return;

    const storageKey = `menu-cart:${publicId}`;
    const readCart = (): CartLine[] => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
          (line): line is CartLine =>
            typeof line === 'object' &&
            line !== null &&
            typeof (line as CartLine).code === 'string' &&
            typeof (line as CartLine).qty === 'number' &&
            typeof (line as CartLine).priceMinor === 'number',
        );
      } catch {
        return [];
      }
    };
    const writeCart = (next: CartLine[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Private browsing — the cart stays in memory for this view.
      }
    };

    let cart: CartLine[] = readCart();

    // ---- Floating badge --------------------------------------------------
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'menu-cart__badge';
    badge.setAttribute('data-menu-cart', '');
    badge.setAttribute('aria-label', strings.cart);

    const badgeIcon = document.createElement('span');
    badgeIcon.className = 'menu-cart__badge-icon';
    badgeIcon.setAttribute('aria-hidden', 'true');
    badgeIcon.textContent = '🛒';

    const badgeCount = document.createElement('span');
    badgeCount.className = 'menu-cart__badge-count';
    badgeCount.setAttribute('aria-hidden', 'true');

    const badgeLabel = document.createElement('span');
    badgeLabel.className = 'menu-cart__badge-label';
    badgeLabel.textContent = strings.cart;

    badge.append(badgeIcon, badgeCount, badgeLabel);
    document.body.appendChild(badge);

    // ---- Drawer ----------------------------------------------------------
    const scrim = document.createElement('div');
    scrim.className = 'menu-cart__scrim';
    scrim.hidden = true;

    const drawer = document.createElement('aside');
    drawer.className = 'menu-cart__drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', strings.cart);
    drawer.hidden = true;

    const drawerHead = document.createElement('header');
    drawerHead.className = 'menu-cart__head';
    const drawerTitle = document.createElement('h2');
    drawerTitle.className = 'menu-cart__title';
    drawerTitle.textContent = strings.cart;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'menu-cart__close';
    closeBtn.setAttribute('aria-label', strings.remove);
    closeBtn.textContent = '×';
    drawerHead.append(drawerTitle, closeBtn);

    const list = document.createElement('ul');
    list.className = 'menu-cart__list';

    const empty = document.createElement('p');
    empty.className = 'menu-cart__empty';
    empty.textContent = strings.cartEmpty;

    const footer = document.createElement('footer');
    footer.className = 'menu-cart__footer';

    const totalRow = document.createElement('p');
    totalRow.className = 'menu-cart__total';

    const whatsappBtn = document.createElement('a');
    whatsappBtn.className = 'menu-cart__order';
    whatsappBtn.textContent = strings.orderOnWhatsapp;
    whatsappBtn.target = '_blank';
    whatsappBtn.rel = 'noopener noreferrer';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'menu-cart__clear';
    clearBtn.textContent = strings.clear;

    footer.append(totalRow, whatsappBtn, clearBtn);
    drawer.append(drawerHead, list, empty, footer);

    document.body.append(scrim, drawer);

    // ---- Render ----------------------------------------------------------
    const render = () => {
      // Badge count + visibility.
      const count = cart.reduce((n, line) => n + line.qty, 0);
      badgeCount.textContent = String(count);
      badge.toggleAttribute('data-empty', count === 0);

      // Drawer list.
      list.innerHTML = '';
      if (cart.length === 0) {
        list.hidden = true;
        empty.hidden = false;
        footer.hidden = true;
      } else {
        list.hidden = false;
        empty.hidden = true;
        footer.hidden = false;

        for (const line of cart) {
          const row = document.createElement('li');
          row.className = 'menu-cart__row';

          if (line.image) {
            const img = document.createElement('img');
            img.className = 'menu-cart__row-image';
            img.src = line.image;
            img.alt = '';
            img.loading = 'lazy';
            row.appendChild(img);
          }

          const body = document.createElement('div');
          body.className = 'menu-cart__row-body';
          const name = document.createElement('span');
          name.className = 'menu-cart__row-name';
          name.textContent = locale === 'ar' ? line.nameAr : line.nameEn;
          const price = document.createElement('span');
          price.className = 'menu-cart__row-price';
          price.textContent = formatPrice(line.priceMinor * line.qty, line.currency, locale);
          body.append(name, price);

          const stepper = document.createElement('div');
          stepper.className = 'menu-cart__stepper';
          const dec = document.createElement('button');
          dec.type = 'button';
          dec.className = 'menu-cart__step';
          dec.setAttribute('aria-label', strings.decrease);
          dec.textContent = '−';
          dec.addEventListener('click', () => {
            const next = cart
              .map((l) => (l.code === line.code ? { ...l, qty: l.qty - 1 } : l))
              .filter((l) => l.qty > 0);
            cart = next;
            writeCart(cart);
            render();
          });
          const qty = document.createElement('span');
          qty.className = 'menu-cart__qty';
          qty.textContent = String(line.qty);
          const inc = document.createElement('button');
          inc.type = 'button';
          inc.className = 'menu-cart__step';
          inc.setAttribute('aria-label', strings.increase);
          inc.textContent = '+';
          inc.addEventListener('click', () => {
            cart = cart.map((l) => (l.code === line.code ? { ...l, qty: l.qty + 1 } : l));
            writeCart(cart);
            render();
          });
          stepper.append(dec, qty, inc);

          row.append(body, stepper);
          list.appendChild(row);
        }

        const totalMinor = cart.reduce((n, l) => n + l.priceMinor * l.qty, 0);
        totalRow.textContent = `${strings.total} ${formatPrice(totalMinor, currency, locale)}`;

        // Build WhatsApp text — bilingual, newline-separated.
        const lines: string[] = [strings.orderHeading, ''];
        for (const line of cart) {
          const name = locale === 'ar' ? line.nameAr : line.nameEn;
          const lineTotal = formatPrice(line.priceMinor * line.qty, line.currency, locale);
          lines.push(
            strings.orderLineTemplate
              .replace('{name}', name)
              .replace('{qty}', String(line.qty))
              .replace('{total}', lineTotal),
          );
        }
        lines.push('');
        lines.push(strings.orderTotalTemplate.replace('{total}', formatPrice(totalMinor, currency, locale)));

        const text = encodeURIComponent(lines.join('\n'));
        whatsappBtn.href = `https://wa.me/${whatsapp}?text=${text}`;
      }

      // Reflect the item count in each card's add-button label.
      for (const addBtn of document.querySelectorAll<HTMLButtonElement>('[data-menu-cart-add]')) {
        const code = addBtn.dataset.menuCartAdd;
        const line = cart.find((l) => l.code === code);
        if (line) {
          addBtn.textContent = `${line.qty} ×`;
          addBtn.setAttribute('data-in-cart', '');
        } else {
          addBtn.textContent = '+';
          addBtn.removeAttribute('data-in-cart');
        }
      }
    };

    // ---- Add-button injection on every item card -------------------------
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-item]'));
    for (const item of items) {
      const code = item.dataset.itemCode;
      const nameAr = item.dataset.itemNameAr ?? '';
      const nameEn = item.dataset.itemNameEn ?? nameAr;
      const priceRaw = item.dataset.itemPrice;
      const itemCurrency = item.dataset.itemCurrency ?? currency;
      const image = item.dataset.itemImage;
      const unavailable = item.hasAttribute('data-unavailable');

      // Items without a price (awaiting pricing) and unavailable items do not
      // get an add button — ordering them makes no sense.
      if (!code || !priceRaw || unavailable) continue;
      const priceMinor = Number.parseInt(priceRaw, 10);
      if (!Number.isFinite(priceMinor)) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-cart__add';
      button.setAttribute('data-menu-cart-add', code);
      button.setAttribute('aria-label', strings.addToOrder);
      button.textContent = '+';

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const existing = cart.find((l) => l.code === code);
        if (existing) {
          cart = cart.map((l) => (l.code === code ? { ...l, qty: l.qty + 1 } : l));
        } else {
          cart = [
            ...cart,
            {
              code,
              nameAr,
              nameEn,
              priceMinor,
              currency: itemCurrency,
              qty: 1,
              image,
            },
          ];
        }
        writeCart(cart);
        render();
      });

      item.appendChild(button);
    }

    // ---- Drawer open / close --------------------------------------------
    const open = () => {
      drawer.hidden = false;
      scrim.hidden = false;
      document.body.setAttribute('data-cart-open', '');
      // Give focus to the close button for keyboard users.
      queueMicrotask(() => closeBtn.focus());
    };
    const close = () => {
      drawer.hidden = true;
      scrim.hidden = true;
      document.body.removeAttribute('data-cart-open');
      badge.focus();
    };
    badge.addEventListener('click', open);
    scrim.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !drawer.hidden) close();
    });

    clearBtn.addEventListener('click', () => {
      cart = [];
      writeCart(cart);
      render();
    });

    render();

    return () => {
      // StrictMode cleanup — remove the elements we created so a second mount
      // can run cleanly.
      badge.remove();
      drawer.remove();
      scrim.remove();
      for (const btn of document.querySelectorAll('[data-menu-cart-add]')) btn.remove();
      document.body.removeAttribute('data-cart-open');
    };
  }, [publicId, whatsapp, currency, locale, strings]);

  return null;
}
