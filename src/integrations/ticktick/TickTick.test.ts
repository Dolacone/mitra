import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Entry, EntryStatus, EntryType } from '#features/entries'
import { Recurrence, RecurrenceFrequency } from '#features/recurrence'
import { EntryTimeZone } from '#features/time/EntryTimeZone.js'
import { TimeZone } from '#features/time/TimeZone.js'
import { TickTick, type TickTickTask } from './TickTick.js'

const taipei = TimeZone.of('Asia/Taipei')
const at = (iso: string) => new Date(iso)
const task = (init: Partial<TickTickTask> = {}): TickTickTask => ({ id: 't1', projectId: 'p1', title: 'Task', kind: 'TEXT', timeZone: 'Asia/Taipei', status: 0, ...init })
const entryOf = (init: Partial<TickTickTask>) => {
	const entry = new Entry({ id: 'e1', sourceId: 's1' })
	TickTick.applyTask(entry, task(init), taipei)
	return entry
}

describe('TickTick', () => {
	describe('reading a task', () => {
		it('takes equal dates on a day for an all-day task that day, held as its UTC midnight', () => {
			const entry = entryOf({ startDate: '2026-12-16T00:00:00+0800', dueDate: '2026-12-16T00:00:00+0800', isAllDay: true })
			assert.deepEqual([entry.allDay, entry.start, entry.end], [true, at('2026-12-16T00:00:00Z'), at('2026-12-17T00:00:00Z')])
		})

		it('takes an all-day span\'s due for the midnight after its last day', () => {
			const entry = entryOf({ startDate: '2026-12-01T00:00:00+0800', dueDate: '2026-12-04T00:00:00+0800', isAllDay: true })
			assert.deepEqual([entry.start, entry.end], [at('2026-12-01T00:00:00Z'), at('2026-12-04T00:00:00Z')])
		})

		it('takes equal timed dates for a moment in the task\'s zone', () => {
			const entry = entryOf({ startDate: '2027-04-01T10:00:00+0800', dueDate: '2027-04-01T10:00:00+0800', isAllDay: false })
			assert.deepEqual([entry.allDay, entry.start, entry.end, entry.timeZone], [false, at('2027-04-01T02:00:00Z'), undefined, EntryTimeZone.parse('Asia/Taipei')])
		})

		it('takes a later due for the end', () => {
			const entry = entryOf({ startDate: '2027-04-01T10:00:00+0800', dueDate: '2027-04-01T11:30:00+0800', isAllDay: false })
			assert.deepEqual([entry.start, entry.end], [at('2027-04-01T02:00:00Z'), at('2027-04-01T03:30:00Z')])
		})

		it('leaves a task without dates unscheduled, and its rule with nothing to repeat from', () => {
			const entry = entryOf({ startDate: null, dueDate: null, repeatFlag: 'RRULE:FREQ=DAILY' })
			assert.deepEqual([entry.start, entry.end, entry.recurrence, entry.type], [undefined, undefined, undefined, EntryType.Task])
		})

		it('reads open, completed and abandoned as To Do, Done and Cancelled', () => {
			assert.deepEqual([0, 2, -1].map(status => entryOf({ status }).status), [EntryStatus.ToDo, EntryStatus.Done, EntryStatus.Cancelled])
		})

		it('repeats by an RRULE, and by no list of dates', () => {
			const weekly = entryOf({ startDate: '2026-12-16T00:00:00+0800', isAllDay: true, repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=2' })
			assert.deepEqual([weekly.recurrence?.freq, weekly.recurrence?.interval], [RecurrenceFrequency.Weekly, 2])
			assert.equal(entryOf({ startDate: '2026-12-16T00:00:00+0800', isAllDay: true, repeatFlag: 'ERULE:NAME=CUSTOM;BYDATE=20261216,20261220' }).recurrence, undefined)
		})

		it('writes a checklist\'s items into its description as task lines after its text', () => {
			const entry = entryOf({ kind: 'CHECKLIST', desc: 'Pack', content: 'ignored', items: [{ id: 'a', title: 'Passport', status: 1 }, { id: 'b', title: 'Charger', status: 0 }] })
			assert.equal(entry.description, 'Pack\n\n- [x] Passport\n- [ ] Charger')
			assert.equal(entryOf({ content: 'Notes' }).description, 'Notes')
		})

		it('keeps the task it read, by its version, so a write leaves the rest as it is', () => {
			const entry = entryOf({ etag: 'v1', tags: ['work'] })
			assert.equal(entry.data?.etag, 'v1')
			assert.deepEqual(TickTick.storedTaskOf(entry)?.tags, ['work'])
		})
	})

	describe('writing an entry', () => {
		const instant = (iso: string) => new Date(iso) as never
		const task = (init: Partial<Entry>) => new Entry({ type: EntryType.Task, heading: 'Task', ...init })

		it('writes a day as equal dates at its midnight in the task\'s zone', () => {
			const dates = TickTick.datesFrom(task({ allDay: true, start: instant('2026-12-16T00:00:00Z'), end: instant('2026-12-17T00:00:00Z') }), { timeZone: 'Asia/Taipei' }, TimeZone.UTC)
			assert.deepEqual(dates, { startDate: '2026-12-16T00:00:00+0800', dueDate: '2026-12-16T00:00:00+0800', isAllDay: true, timeZone: 'Asia/Taipei' })
		})

		it('writes days as a due on the midnight after the last one', () => {
			const dates = TickTick.datesFrom(task({ allDay: true, start: instant('2026-12-01T00:00:00Z'), end: instant('2026-12-04T00:00:00Z') }), { timeZone: 'Asia/Taipei' }, TimeZone.UTC)
			assert.equal(dates.dueDate, '2026-12-04T00:00:00+0800')
		})

		it('writes a moment as equal times and a span as its end, in the account\'s zone where the entry names none', () => {
			assert.deepEqual(TickTick.datesFrom(task({ start: instant('2027-04-01T02:00:00Z') }), undefined, taipei), { startDate: '2027-04-01T10:00:00+0800', dueDate: '2027-04-01T10:00:00+0800', isAllDay: false, timeZone: 'Asia/Taipei' })
			assert.equal(TickTick.datesFrom(task({ start: instant('2027-04-01T02:00:00Z'), end: instant('2027-04-01T03:30:00Z') }), undefined, taipei).dueDate, '2027-04-01T11:30:00+0800')
		})

		it('writes an entry\'s own zone over the account\'s', () => {
			const dates = TickTick.datesFrom(task({ start: instant('2027-04-01T02:00:00Z'), timeZone: EntryTimeZone.parse('Europe/Berlin') }), undefined, taipei)
			assert.deepEqual([dates.startDate, dates.timeZone], ['2027-04-01T04:00:00+0200', 'Europe/Berlin'])
		})

		it('clears the dates of an unscheduled task', () => {
			assert.deepEqual(TickTick.datesFrom(task({}), undefined, taipei), { startDate: null, dueDate: null, isAllDay: false, timeZone: 'Asia/Taipei' })
		})

		it('reads back what it writes', () => {
			const written = task({ start: instant('2027-04-01T02:00:00Z'), end: instant('2027-04-01T03:30:00Z'), timeZone: EntryTimeZone.parse('Asia/Taipei') })
			const read = new Entry({ id: 'e1' })
			TickTick.applyTask(read, { id: 't1', projectId: 'p1', ...TickTick.datesFrom(written, undefined, taipei) }, taipei)
			assert.deepEqual([read.start, read.end, read.allDay], [written.start, written.end, false])
		})

		it('writes a checklist\'s task lines back as its items, each keeping the id of the item at its place', () => {
			const stored = { kind: 'CHECKLIST' as const, items: [{ id: 'a', title: 'Passport', status: 1, sortOrder: 10, startDate: '2026-12-01T00:00:00+0800' }, { id: 'b', title: 'Charger', status: 0, sortOrder: 20 }] }
			const text = TickTick.textFrom('Pack\n\n- [ ] Passport\n- [x] Charger\n- [ ] Socks', stored)
			assert.deepEqual(text, {
				desc: 'Pack',
				items: [
					{ id: 'a', title: 'Passport', status: 0, sortOrder: 10, startDate: '2026-12-01T00:00:00+0800' },
					{ id: 'b', title: 'Charger', status: 1, sortOrder: 20 },
					{ title: 'Socks', status: 0, sortOrder: 2 },
				],
			})
		})

		it('writes a text task\'s description as its content', () => {
			assert.deepEqual(TickTick.textFrom('Notes\n- [ ] not an item', { kind: 'TEXT' }), { content: 'Notes\n- [ ] not an item' })
		})

		it('writes its rule as an RRULE, and leaves one Mitra could not read as it is', () => {
			assert.equal(TickTick.repeatFlagFrom(task({ recurrence: new Recurrence({ freq: RecurrenceFrequency.Daily }) }), undefined), 'RRULE:FREQ=DAILY')
			assert.equal(TickTick.repeatFlagFrom(task({}), { repeatFlag: 'ERULE:NAME=CUSTOM;BYDATE=20261216' }), 'ERULE:NAME=CUSTOM;BYDATE=20261216')
			assert.equal(TickTick.repeatFlagFrom(task({}), { repeatFlag: 'RRULE:FREQ=DAILY' }), null)
		})

		it('keeps what Mitra does not hold of the task it writes over', () => {
			const stored: TickTickTask = { id: 't1', projectId: 'p1', title: 'Old', kind: 'TEXT', priority: 5, tags: ['work'], reminders: ['TRIGGER:PT0S'], columnId: 'c1', status: 0 }
			const written = TickTick.taskFrom(task({ heading: 'New' }), stored, { projectId: 'p1', zone: taipei })
			assert.deepEqual([written.title, written.priority, written.tags, written.reminders, written.columnId], ['New', 5, ['work'], ['TRIGGER:PT0S'], 'c1'])
		})

		it('cancels as abandoned and reopens as open, leaving completion to the complete endpoint', () => {
			assert.equal(TickTick.statusFrom(task({ status: EntryStatus.Cancelled }), { status: 0 }), -1)
			assert.equal(TickTick.statusFrom(task({ status: EntryStatus.ToDo }), { status: 2 }), 0)
			assert.equal(TickTick.statusFrom(task({ status: EntryStatus.Done }), { status: 0 }), 0)
		})
	})

	it('lists the inbox first, then the open lists in TickTick\'s order, one shared to read read-only, all off', () => {
		const sources = TickTick.sourcesFrom([
			{ id: 'p2', name: 'Home', sortOrder: 2, color: '#F18181' },
			{ id: 'p1', name: 'Work', sortOrder: 1, permission: 'read' },
			{ id: 'p3', name: 'Old', sortOrder: 0, closed: true },
		])
		assert.deepEqual(sources.map(source => [source.name, source.uri, !!source.readOnly, source.enabled]), [
			['Inbox', 'ticktick://project/inbox', false, false],
			['Work', 'ticktick://project/p1', true, false],
			['Home', 'ticktick://project/p2', false, false],
		])
		assert.deepEqual(sources.map(source => source.entryTypes), [[EntryType.Task], [EntryType.Task], [EntryType.Task]])
	})

	it('keeps a repeating task\'s dates as one', () => {
		assert.equal(new TickTick().capabilities.entries.occurrences, false)
	})
})
