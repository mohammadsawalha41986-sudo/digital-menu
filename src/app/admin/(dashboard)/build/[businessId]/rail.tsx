'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BUILD_STEPS } from './steps';

/** The step list. Every step stays reachable; none is ever locked behind another. */
export function BuildRail({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const current = pathname.split('/').at(-1) ?? '';

  return (
    <nav className="build__rail" aria-label="Steps">
      <ol>
        {BUILD_STEPS.map((step) => {
          const active = step.key === current;

          return (
            <li key={step.key}>
              <Link
                href={`/admin/build/${businessId}/${step.key}`}
                className="build__rail-link"
                aria-current={active ? 'step' : undefined}
              >
                <span className="build__rail-number">{step.number}</span>
                <span>
                  <span className="build__rail-title">{step.title}</span>
                  <span className="build__rail-summary">{step.summary}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
