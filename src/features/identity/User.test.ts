import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Source } from '#features/sources'
import { revive, wireOf } from '#infrastructure/model/wire.testing.js'
import { User } from './User.js'

describe('User', () => {
	describe('showOnly / restorePreviousVisibility', () => {
		const sourcesOf = (...hidden: Array<boolean>) => hidden.map((isHidden, index) =>
			new Source({ id: `s${index}`, integrationId: 'i', uri: `dev://s${index}`, name: `s${index}`, enabled: true, hidden: isHidden }))
		const hiddenOf = (sources: Array<Source>) => sources.map(source => source.hidden)

		it('leaves only the chosen calendar on show, and records what was hidden', () => {
			const user = new User({ username: 'u' })
			const sources = sourcesOf(false, false, true)
			user.showOnly(sources, 's0')
			assert.deepEqual(hiddenOf(sources), [false, true, true])
			assert.deepEqual(user.previouslyHiddenSourceIds, ['s2'])
		})

		it('records an EMPTY list when nothing was hidden, which still means "soloed"', () => {
			const user = new User({ username: 'u' })
			user.showOnly(sourcesOf(false, false), 's0')
			assert.deepEqual(user.previouslyHiddenSourceIds, [])
		})

		it('keeps the original record when hopping from one solo to the next', () => {
			const user = new User({ username: 'u' })
			const sources = sourcesOf(false, false, true)
			user.showOnly(sources, 's0')
			user.showOnly(sources, 's1')
			assert.deepEqual(hiddenOf(sources), [true, false, true])
			assert.deepEqual(user.previouslyHiddenSourceIds, ['s2'])
		})

		it('records nothing when the chosen calendar is already the only one shown', () => {
			const user = new User({ username: 'u' })
			user.showOnly(sourcesOf(false, true), 's0')
			assert.equal(user.previouslyHiddenSourceIds, undefined)
		})

		it('comes back to the visibility from before the solo, and spends the record', () => {
			const user = new User({ username: 'u' })
			const sources = sourcesOf(false, false, true)
			user.showOnly(sources, 's0')
			user.restorePreviousVisibility(sources)
			assert.deepEqual(hiddenOf(sources), [false, false, true])
			assert.equal(user.previouslyHiddenSourceIds, undefined)
		})

		it('brings a calendar that appeared mid-solo back SHOWN, since no record ever knew of it', () => {
			const user = new User({ username: 'u' })
			const sources = sourcesOf(false, false, true)
			user.showOnly(sources, 's0')
			const fresh = new Source({ id: 'fresh', integrationId: 'i', uri: 'dev://fresh', name: 'fresh', enabled: true, hidden: false })
			sources.push(fresh)
			user.restorePreviousVisibility(sources)
			assert.equal(fresh.hidden, false)
			assert.deepEqual(hiddenOf(sources), [false, false, true, false])
		})
	})

	describe('previouslyHiddenSourceIds', () => {
		const round = (ids: Array<string> | undefined) => revive<User>(wireOf(new User({ username: 'u', previouslyHiddenSourceIds: ids }))).previouslyHiddenSourceIds

		it('keeps an empty list distinct from an absent one', () => {
			assert.deepEqual(round([]), [])
			assert.equal(round(undefined), undefined)
		})

		it('carries the recorded ids', () => {
			assert.deepEqual(round(['a', 'b']), ['a', 'b'])
		})
	})
})
