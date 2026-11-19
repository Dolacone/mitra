import type { DateTime } from '@3mo/date-time'
import type { EntryOccurrence } from '#features/recurrence'
import { SnapSetting } from './SnapSetting.js'
import { EntryStore } from './EntryStore.js'
import { DayHours } from './DayHours.js'

export interface TimedOverlap {
	readonly slot: number
	readonly total: number
	readonly span: number
	readonly inset: number
}

/** One day of an occurrence, as the views lay it out. */
export class EntrySegment {
	previous?: EntrySegment
	next?: EntrySegment
	overlap?: TimedOverlap
	covers = false

	constructor(readonly occurrence: EntryOccurrence, readonly date?: DateTime, readonly hours = DayHours.whole) { }

	/** What it shows. */
	get entry() {
		return this.occurrence.entry
	}

	get hasPrevious() { return !!this.previous }
	get hasNext() { return !!this.next }

	private _startMinute?: number
	get startMinute(): number {
		const { start } = this.occurrence
		return this._startMinute ??= this.previous || !start ? 1 : this.minuteOf(start) + 1
	}

	private _endMinute?: number
	get endMinute(): number {
		if (this._endMinute === undefined) {
			const { end } = this.occurrence
			const { length } = this.hours
			const line = end ? Math.min(this.minuteOf(end), length) + 1 : undefined
			this._endMinute = line !== undefined && line > this.startMinute ? line : Math.min(this.startMinute + (this.entry.source?.integration.momentMinutes ?? SnapSetting.current), length + 1)
		}
		return this._endMinute
	}

	/** Whether it begins within its day's hours rather than after them. */
	get shown() {
		return this.startMinute <= this.hours.length
	}

	private minuteOf(instant: DateTime) {
		return this.date ? this.hours.minuteOf(instant, this.date) : instant.hour * 60 + instant.minute
	}

	/** Midnight epoch-ms for the segment's day. */
	private _dayValue?: number
	get dayValue(): number | undefined {
		return this._dayValue ??= this.date?.dayStart.valueOf()
	}

	get allDay() {
		return !!this.previous || !!this.next || this.occurrence.allDay
	}

	get runEnd(): EntrySegment {
		return this.next?.runEnd ?? this
	}

	get id() {
		return `${this.occurrence.key ?? (EntryStore.pending.isPreview(this.entry) ? 'preview' : 'draft')}-${this.dayValue ?? 0}`
	}

	fallsOn(dayValue: number) {
		return this.date ? this.dayValue === dayValue : this.occurrence.start?.dayStart.valueOf() === dayValue
	}

	fallsOnDay(date: DateTime) {
		return this.fallsOn(date.dayStart.valueOf())
	}

	overlaps(other: EntrySegment) {
		return Math.max(this.startMinute, other.startMinute) < Math.min(this.endMinute, other.endMinute)
	}
}
