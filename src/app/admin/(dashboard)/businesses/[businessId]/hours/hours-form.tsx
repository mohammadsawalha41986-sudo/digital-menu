'use client';

import { ActionForm } from '../../../components';
import type { ActionState } from '@/server/admin/actions';
import { WEEKDAYS, type WorkingHours } from '@/server/business/hours';

const DAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

/**
 * The opening-hours editor.
 *
 * Native `<input type="time">` on purpose: on a phone it opens the platform's
 * own time picker, it validates without JavaScript, and it submits the exact
 * `HH:MM` the server stores. A custom picker would look more designed and work
 * worse in the one place this is actually used — behind a counter, on a phone,
 * in a hurry (§21, §166).
 *
 * A second interval per day covers the split shift a café or salon runs. Days
 * left blank are simply not published; a business that never opens on Friday
 * ticks Closed, which is a statement, unlike an empty row.
 */
export function HoursForm({
  action,
  hours,
  timezones,
  submitLabel = 'Save opening hours',
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  hours: WorkingHours | null;
  timezones: readonly string[];
  submitLabel?: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      <label className="admin__field">
        <span className="admin__label">Timezone</span>
        <select
          name="hours_timezone"
          className="admin__select"
          defaultValue={hours?.timezone ?? timezones[0]}
        >
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <span className="admin__hint">
          Open and closed are worked out in this timezone, so a visitor abroad still sees
          whether the business is open where it actually is.
        </span>
      </label>

      <div className="admin__table-scroll">
        <table className="admin__table admin__table--hours">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Closed</th>
              <th scope="col">Opens</th>
              <th scope="col">Closes</th>
              <th scope="col">Second shift opens</th>
              <th scope="col">Second shift closes</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => {
              const entry = hours?.days[day];
              const first = entry?.intervals[0];
              const second = entry?.intervals[1];

              return (
                <tr key={day} data-hours-day={day}>
                  <th scope="row">{DAY_LABELS[day]}</th>
                  <td>
                    <input
                      type="checkbox"
                      name={`hours_${day}_closed`}
                      defaultChecked={entry?.closed ?? false}
                      aria-label={`${DAY_LABELS[day]} closed all day`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`hours_${day}_opens1`}
                      defaultValue={first?.opens ?? ''}
                      className="admin__input"
                      aria-label={`${DAY_LABELS[day]} opens`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`hours_${day}_closes1`}
                      defaultValue={first?.closes ?? ''}
                      className="admin__input"
                      aria-label={`${DAY_LABELS[day]} closes`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`hours_${day}_opens2`}
                      defaultValue={second?.opens ?? ''}
                      className="admin__input"
                      aria-label={`${DAY_LABELS[day]} second shift opens`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`hours_${day}_closes2`}
                      defaultValue={second?.closes ?? ''}
                      className="admin__input"
                      aria-label={`${DAY_LABELS[day]} second shift closes`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="admin__hint">
        A closing time earlier than the opening time means the shift runs past midnight —
        20:00 to 02:00 is a normal evening. Leaving a day blank publishes nothing for it.
        Clearing every day removes the opening-hours section from the public profile.
      </p>
    </ActionForm>
  );
}
