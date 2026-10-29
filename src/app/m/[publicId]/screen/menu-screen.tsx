'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MenuCategory, MenuItem, RestaurantInfo } from '@/templates/street-food/sabah/data/menuData';
import { currencyUnit, formatAmount } from '@/templates/street-food/sabah/money';

/** Most a ring can hold before the cards get too small to read across a room. */
const RING_SIZE = 9;

interface Slide {
  category: MenuCategory;
  dishes: MenuItem[];
}

/**
 * Splits each category into rings of at most RING_SIZE dishes, so a long
 * category becomes several turns rather than a ring of unreadable cards.
 */
function buildSlides(categories: MenuCategory[], items: MenuItem[]): Slide[] {
  return categories.flatMap((category) => {
    const dishes = items.filter((item) => item.categoryId === category.id);
    const slides: Slide[] = [];
    for (let start = 0; start < dishes.length; start += RING_SIZE) {
      slides.push({ category, dishes: dishes.slice(start, start + RING_SIZE) });
    }
    return slides;
  });
}

/** Which ring is on screen, and which of its dishes faces forward, at a step. */
function positionAt(step: number, slides: Slide[]) {
  const total = slides.reduce((sum, slide) => sum + slide.dishes.length, 0);
  if (total === 0) return { slideIndex: 0, dishIndex: 0, turn: 0 };

  const turn = Math.floor(step / total);
  let remaining = step % total;
  for (let index = 0; index < slides.length; index += 1) {
    const count = slides[index]!.dishes.length;
    if (remaining < count) return { slideIndex: index, dishIndex: remaining, turn };
    remaining -= count;
  }
  return { slideIndex: 0, dishIndex: 0, turn };
}

export function MenuScreen({
  lang,
  info,
  categories,
  items,
  logoUrl,
  qrDataUri,
  seconds,
}: {
  lang: 'ar' | 'en';
  info: RestaurantInfo;
  categories: MenuCategory[];
  items: MenuItem[];
  logoUrl: string | null;
  qrDataUri: string | null;
  seconds: number;
}) {
  const isAr = lang === 'ar';
  const slides = useMemo(() => buildSlides(categories, items), [categories, items]);

  // One counter drives everything: which dish faces forward, and — once a
  // ring has turned all the way — which ring is on screen.
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (slides.length === 0) return;
    const id = setInterval(() => setStep((value) => value + 1), seconds * 1000);
    return () => clearInterval(id);
  }, [seconds, slides.length]);

  const position = positionAt(step, slides);

  const slide = slides[position.slideIndex];
  const name = isAr ? info.nameAr : info.nameEn;

  return (
    <div className="menu-screen__stage">
      <header className="menu-screen__head">
        <div className="menu-screen__brand">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="menu-screen__logo" src={logoUrl} alt="" />
          ) : null}
          <h1 className="menu-screen__name">{name}</h1>
        </div>
        {slide ? (
          <p className="menu-screen__category" key={`${position.slideIndex}-${position.turn}`}>
            {isAr ? slide.category.nameAr : slide.category.nameEn}
          </p>
        ) : null}
      </header>

      {slide ? (
        <Ring
          // A new key per ring restarts the flip-in animation.
          key={`${position.slideIndex}-${position.turn}`}
          dishes={slide.dishes}
          active={position.dishIndex}
          isAr={isAr}
          currency={info.currency}
        />
      ) : (
        <p className="menu-screen__empty">{isAr ? 'المنيو قيد التحضير' : 'Menu coming soon'}</p>
      )}

      {qrDataUri ? (
        <aside className="menu-screen__qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUri} alt="" />
          <span>{isAr ? 'امسح واطلب من جوالك' : 'Scan to order on your phone'}</span>
        </aside>
      ) : null}

      {slides.length > 1 ? (
        <nav className="menu-screen__dots" aria-hidden="true">
          {slides.map((entry, index) => (
            <span key={`${entry.category.id}-${index}`} data-active={index === position.slideIndex ? '' : undefined} />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function Ring({
  dishes,
  active,
  isAr,
  currency,
}: {
  dishes: MenuItem[];
  active: number;
  isAr: boolean;
  currency: string;
}) {
  const count = dishes.length;
  const front = dishes[active];
  // Following dishes sit on the reading side: to the left in Arabic.
  const side = isAr ? -1 : 1;

  return (
    <section className="menu-screen__ring-wrap">
      <div className="menu-screen__ring">
        {dishes.map((dish, index) => {
          // Shortest way round, so the flow wraps without a long jump back.
          let offset = index - active;
          if (offset > count / 2) offset -= count;
          if (offset < -count / 2) offset += count;
          const distance = Math.abs(offset);

          return (
            <article
              key={dish.id}
              className="menu-screen__card"
              data-front={offset === 0 ? '' : undefined}
              data-item={dish.id}
              aria-hidden={offset === 0 ? undefined : true}
              style={{
                transform: `translateX(calc(var(--card-w) * ${0.72 * offset * side})) translateZ(calc(var(--card-w) * ${-0.55 * distance})) rotateY(${-38 * Math.sign(offset) * side}deg)`,
                zIndex: 100 - distance,
                opacity: distance > 2 ? 0 : 1,
              }}
            >
              {dish.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dish.image}
                  srcSet={dish.imageSrcSet}
                  sizes="30vw"
                  alt=""
                  style={{ objectPosition: dish.imagePosition }}
                />
              ) : (
                <div className="menu-screen__card-blank" />
              )}
              <div className="menu-screen__card-body">
                <h2>{isAr ? dish.nameAr : dish.nameEn}</h2>
                {dish.noPrice ? null : (
                  <p className="menu-screen__price" data-price>
                    {formatAmount(dish.price, currency)} <small>{currencyUnit(currency, isAr)}</small>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {front ? (
        <div className="menu-screen__detail" key={front.id}>
          {front.descriptionAr || front.descriptionEn ? (
            <p>{isAr ? front.descriptionAr : front.descriptionEn}</p>
          ) : null}
          {front.calories ? (
            <span className="menu-screen__kcal" data-calories>
              {front.calories} {isAr ? 'سعرة' : 'kcal'}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
