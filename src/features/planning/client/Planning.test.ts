import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from '@3mo/date-time'
import { Entry, EntryStatus, EntryType } from '#features/entries'
import { Planning } from './Planning.js'

describe('Planning', () => {
	describe('plannedOn', () => {
		const day = new DateTime('2026-11-19T00:00:00')
		const task = (init: Partial<Entry>) => new Entry({ type: EntryType.Task, heading: 'Task', ...init }).occurrences.single
		const plannedOn = (init: Partial<Entry>) => Planning.plannedOn(task(init), day)

		it('lists an open task at a time that day', () => {
			assert.equal(plannedOn({ start: day.add({ hours: 10 }) }), true)
		})

		it('lists an open task all day that day', () => {
			assert.equal(plannedOn({ start: day, allDay: true }), true)
		})

		it('lists a task past midnight in the day whose hours run until 01:00', () => {
			assert.equal(plannedOn({ start: day.add({ days: 1, minutes: 30 }) }), true)
		})

		it('leaves out a task on another day, so the group is today alone', () => {
			assert.equal(plannedOn({ start: day.add({ days: 1, hours: 10 }) }), false)
			assert.equal(plannedOn({ start: day.subtract({ hours: 14 }) }), false)
		})

		it('leaves out what is no open task: a closed one, an event and an unscheduled one', () => {
			assert.equal(plannedOn({ start: day.add({ hours: 10 }), status: EntryStatus.Done }), false)
			assert.equal(Planning.plannedOn(new Entry({ type: EntryType.Event, heading: 'Event', start: day.add({ hours: 10 }) }).occurrences.single, day), false)
			assert.equal(plannedOn({}), false)
		})
	})
})
