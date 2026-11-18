import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from '@3mo/date-time'
import { Entry } from '../../Entry.js'
import { DayCells } from '../DayCells.js'
import { DayHours } from '../DayHours.js'
import { type DragStart } from './DragGesture.js'
import { MoveGesture } from './MoveGesture.js'
import { ResizeGesture } from './ResizeGesture.js'
import type { EntrySegmentComponent } from '../EventSegment.js'

describe('DragGesture', () => {
	/** A week from Monday 12 October, each day 100 wide and a minute of the week's hours a pixel tall. */
	const day = (index: number) => new DateTime(`2026-10-${12 + index}T00:00:00`)
	const { length } = DayHours.week
	const cells = new DayCells(Array.from({ length: 7 }, (_, index) => ({ date: day(index), left: index * 100, right: index * 100 + 99, top: 0, bottom: length, gridTop: 0, gridHeight: length })))
	const start: DragStart = {
		pointerId: 1,
		surface: {} as HTMLElement,
		origin: { x: 50, y: 180 },
		cells,
		gridBox: { left: 0, right: 700, top: 0, bottom: length } as DOMRect,
		armed: false,
	}
	const at = (index: number, hours: number) => day(index).add({ minutes: hours * 60 })
	/** The height of `hours` past a day's midnight on the week's hours. */
	const y = (hours: number) => hours * 60 - DayHours.week.from
	const meeting = () => new Entry({ id: 'm', heading: 'Planning', start: at(0, 10), end: at(0, 11) })

	describe('a move', () => {
		it('lands the entry where the pointer is, keeping the point it was held by', () => {
			const gesture = new MoveGesture(start, 'timed', meeting(), { date: day(0), minute: 10 * 60 + 30 }, {} as EntrySegmentComponent)
			const built = gesture.build({ x: 150, y: y(12.5) })!
			assert.equal(built.start!.valueOf(), at(1, 12).valueOf())
			assert.equal(built.end!.valueOf(), at(1, 13).valueOf())
		})

		it('lands past midnight on the day the late hours belong to', () => {
			const gesture = new MoveGesture(start, 'timed', meeting(), { date: day(0), minute: 10 * 60 }, {} as EntrySegmentComponent)
			const built = gesture.build({ x: 150, y: y(24.5) })!
			assert.equal(built.start!.valueOf(), at(2, 0.5).valueOf())
			assert.equal(built.end!.valueOf(), at(2, 1.5).valueOf())
		})

		it('moves by whole days where the grid places days, each date keeping its time', () => {
			const gesture = new MoveGesture(start, 'allday', meeting(), { date: day(0), minute: 0 }, {} as EntrySegmentComponent)
			const built = gesture.build({ x: 350, y: 100 })!
			assert.equal(built.start!.valueOf(), at(3, 10).valueOf())
			assert.equal(built.end!.valueOf(), at(3, 11).valueOf())
		})

		it('lands nowhere outside the grid, and leaves the entry as it was', () => {
			const entry = meeting()
			const gesture = new MoveGesture(start, 'timed', entry, { date: day(0), minute: 600 }, {} as EntrySegmentComponent)
			assert.equal(gesture.build({ x: 900, y: y(10) }), undefined)
			assert.equal(entry.start!.valueOf(), at(0, 10).valueOf())
		})
	})

	describe('a resize', () => {
		it('drags one edge to the pointer', () => {
			const built = new ResizeGesture(start, 'timed', meeting(), 'end').build({ x: 50, y: y(12) })!
			assert.equal(built.start!.valueOf(), at(0, 10).valueOf())
			assert.equal(built.end!.valueOf(), at(0, 12).valueOf())
		})
	})
})
