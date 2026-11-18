import { DateTime } from '@3mo/date-time'

/**
 * The wall-clock minutes of a day a grid shows, counted from the day's midnight, past 1440 into the next day. A timed
 * moment belongs to the day whose hours begin last at or before it, so what falls after one day's hours and before the
 * next day's belongs to the first and is not shown.
 */
export class DayHours {
	/** Midnight to midnight. */
	static readonly whole = new DayHours(0, 1440)
	/** The week view's: 07:00 to 01:00 the next day. */
	static readonly week = new DayHours(7 * 60, 25 * 60)

	/** The day it is now, which lasts until the week view's hours end, at 01:00 the next day. */
	static get today() {
		const now = new DateTime()
		return now.hour * 60 + now.minute < DayHours.week.to - 1440 ? now.dayStart.subtract({ days: 1 }) : now.dayStart
	}

	private constructor(readonly from: number, readonly to: number) { }

	/** How many minutes a day shows. */
	get length() {
		return this.to - this.from
	}

	/** The day `instant` belongs to. */
	dayOf(instant: DateTime) {
		return instant.hour * 60 + instant.minute < this.from ? instant.dayStart.subtract({ days: 1 }) : instant.dayStart
	}

	/** Wall-clock minutes from the beginning of `day`'s hours to `instant`, beyond {@link length} where it lies past them. */
	minuteOf(instant: DateTime, day: DateTime) {
		const days = day.dayStart.zonedDateTime.toPlainDate().until(instant.dayStart.zonedDateTime.toPlainDate()).days
		return days * 1440 + instant.hour * 60 + instant.minute - this.from
	}
}
