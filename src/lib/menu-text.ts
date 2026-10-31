/**
 * Reading a menu typed or pasted as text — the way most owners already have
 * it, in a message or a document:
 *
 *     دجاج الشواية
 *     نصف دجاج شواية مع الأرز | 23 | نصف دجاج شواية مع أرز
 *     حبة دجاج شواية مع الأرز | 44
 *
 *     الأرز
 *     أرز بخاري | 8
 *
 * A line with no `|` is a section heading. Under it, `Dish | Price` with an
 * optional `| Description`. `Section | Dish | Price | Description` on one
 * line is read too. A line that cannot be read is reported with its number
 * and never guessed at — in particular a dish with no price is not given 0.
 */

export interface TextDish {
  line: number;
  name: string;
  /** The price as written, digits normalised; money is parsed by the caller in its currency. */
  price: string;
  description: string | null;
}

export interface TextSection {
  name: string;
  dishes: TextDish[];
}

export interface TextProblem {
  line: number;
  text: string;
  problem: string;
}

export interface ParsedMenuText {
  sections: TextSection[];
  problems: TextProblem[];
}

/** Used when dishes come before any heading. */
export const DEFAULT_SECTION = 'المنيو';

/** "23", "٢٣", "8.50", "8,50", "23 ر.س", "SAR 23" → the number, else null. */
export function readPrice(value: string): string | null {
  const digits = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫،]/g, '.')
    .replace(/(ر\.?\s?س\.?|ريال|درهم|دينار|د\.?\s?ك|sar|aed|kwd|bhd|omr|qar|sr|kd)/gi, '')
    .trim();
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(digits);
  if (!match) return null;
  return match[2] ? `${match[1]}.${match[2]}` : match[1]!;
}

export function parseMenuText(text: string): ParsedMenuText {
  const sections: TextSection[] = [];
  const problems: TextProblem[] = [];
  let current: TextSection | null = null;

  const sectionNamed = (name: string) => {
    const tidy = name.trim().replace(/\s+/g, ' ');
    // The same heading twice in one paste is one section.
    let section = sections.find((candidate) => candidate.name === tidy);
    if (!section) {
      section = { name: tidy, dishes: [] };
      sections.push(section);
    }
    return section;
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (!content) return;

    const parts = content.split(/[|｜]/).map((part) => part.trim());

    if (parts.length === 1) {
      current = sectionNamed(content);
      return;
    }

    const [first = '', second = '', third = '', fourth = ''] = parts;
    let sectionName: string | null = null;
    let name: string;
    let price: string | null;
    let description: string;

    if (readPrice(second) !== null) {
      [name, price, description] = [first, readPrice(second), parts.slice(2).join(' | ')];
    } else if (parts.length >= 3 && readPrice(third) !== null) {
      [sectionName, name, price, description] = [first, second, readPrice(third), fourth];
    } else {
      problems.push({
        line,
        text: content,
        problem: second === '' ? 'No price — write it after the dish name, e.g. “أرز بخاري | 8”' : `“${second}” is not a price`,
      });
      return;
    }

    if (!name) {
      problems.push({ line, text: content, problem: 'No dish name before the price' });
      return;
    }

    const section: TextSection = sectionName
      ? sectionNamed(sectionName)
      : (current ?? (current = sectionNamed(DEFAULT_SECTION)));
    section.dishes.push({
      line,
      name: name.replace(/\s+/g, ' '),
      price: price ?? '',
      description: description.trim() || null,
    });
  });

  return { sections: sections.filter((section) => section.dishes.length > 0), problems };
}
