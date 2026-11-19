import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { Api } from '@a11d/api'
import { ModelValueConstructor } from '@a11d/api-model-value-constructor'
import { User } from '#features/identity'
import { EntryType } from '#features/entries'
import { MitraCalendar } from '#integrations/mitra/MitraCalendar.js'
import { CreateSource } from './server/CreateSource.js'
import { SetSourceVisibility } from './server/SetSourceVisibility.js'
import { DeleteSource } from './server/DeleteSource.js'
import { RecolorSource } from './server/RecolorSource.js'
import { ReorderSources } from './server/ReorderSources.js'
import { Calendars } from './client/Calendars.js'
import { Source } from './Source.js'
import { RenameSource } from './server/RenameSource.js'
import { Color } from './Color.js'

/*
	An account's integrations and calendars through the app's own API client and its calendar store, the real routes and a
	database: what the sidebar would show after each change.
*/

describe('Integrations and calendars over the wire', () => {
	let app: Server
	let current: User
	let owner: User
	let stranger: User
	let closeOrm: () => Promise<void>

	before(async () => {
		const { orm } = await import('#infrastructure/database/orm.js')
		await import('#integrations/server/registerEngines.js')
		const { operationsRouter } = await import('#infrastructure/operations/server/operationsRouter.js')
		await import('#app/operations.js')

		const em = orm.em.fork()
		owner = new User({ username: 'owner' })
		stranger = new User({ username: 'stranger' })
		const mine = new MitraCalendar({ userId: owner.id, uri: MitraCalendar.uri })
		const theirs = new MitraCalendar({ userId: stranger.id, uri: MitraCalendar.uri })
		em.persist([
			owner, stranger, mine, theirs,
			new Source({ integrationId: mine.id, uri: MitraCalendar.sourceUri('home'), name: 'Home', entryTypes: [EntryType.Event, EntryType.Task], enabled: true, hidden: false, order: 0 }),
			new Source({ integrationId: mine.id, uri: MitraCalendar.sourceUri('work'), name: 'Work', entryTypes: [EntryType.Event, EntryType.Task], enabled: true, hidden: false, order: 1 }),
			new Source({ integrationId: theirs.id, uri: MitraCalendar.sourceUri('private'), name: 'Private', entryTypes: [EntryType.Event], enabled: true, hidden: false }),
		])
		await em.flush()
		current = owner

		closeOrm = () => orm.close()

		const models = new ModelValueConstructor()
		const server = express()
		server.use((req, _res, next) => {
			req.user = current
			next()
		})
		server.use(express.json({ reviver: (_key, value) => models.shallConstruct(value) ? models.construct(value) : value }))
		server.use('/api', operationsRouter(() => orm.em.fork()))
		app = await new Promise<Server>(resolve => {
			const listening = server.listen(0, () => resolve(listening))
		})
		Api.url = `http://localhost:${(app.address() as AddressInfo).port}/api`
		// @a11d/api sets `referrer: 'no-referrer'`, which a browser resolves against the page and Node's fetch refuses.
		const browserFetch = globalThis.fetch
		globalThis.fetch = (input, init) => browserFetch(input, { ...init, referrer: undefined })
	})

	after(async () => {
		await new Promise(resolve => app.close(resolve))
		await closeOrm()
	})

	/** The integrations and their calendars as the sidebar reads them, in the user's order. */
	const shown = async () => {
		await Calendars.fetch()
		return Calendars.integrations.map(integration => ({
			type: integration.type,
			calendars: integration.sources.map(source => source.name),
		}))
	}
	const mitra = () => Calendars.integrations.find(integration => integration instanceof MitraCalendar)!
	const calendar = (name: string) => Calendars.sources.find(source => source.name === name)!
	describe('a Mitra calendar', () => {
		it('lists each integration with its calendars, loaded with it, as real instances', async () => {
			assert.deepEqual(await shown(), [{ type: 'mitra', calendars: ['Home', 'Work'] }])
			assert.ok(mitra() instanceof MitraCalendar)
			assert.ok(Array.isArray(mitra().sources))
			assert.ok(mitra().sources.every(source => source instanceof Source))
		})

		it('creates a calendar, which the next listing shows', async () => {
			const created = await CreateSource.call({ id: mitra().id, name: 'Garden' })
			assert.equal(created.name, 'Garden')
			assert.deepEqual((await shown())[0]!.calendars.sort(), ['Garden', 'Home', 'Work'])
		})

		it('renames and recolors a calendar', async () => {
			await shown()
			const garden = calendar('Garden').id
			await RenameSource.call({ id: garden, name: 'Allotment' })
			await RecolorSource.call({ id: garden, color: Color.parse('#336699')! })
			await shown()
			assert.deepEqual([calendar('Allotment').id, calendar('Allotment').color], [garden, Color.parse('#336699')])
		})

		it('keeps the calendars in the order they were put in', async () => {
			await shown()
			const reversed = [...mitra().sources].reverse()
			await ReorderSources.call({ ids: reversed.map(source => source.id) })
			assert.deepEqual((await shown())[0]!.calendars, reversed.map(source => source.name))
		})

		it('hides and shows a calendar, which stays where entries may live', async () => {
			await shown()
			await SetSourceVisibility.call({ id: calendar('Work').id, hidden: true })
			await shown()
			assert.equal(calendar('Work').hidden, true)
			assert.ok(Calendars.enabled.some(source => source.name === 'Work'))
			await SetSourceVisibility.call({ id: calendar('Work').id, hidden: false })
			await shown()
			assert.equal(calendar('Work').hidden, false)
		})

		it('deletes a calendar, which the next listing leaves out', async () => {
			await shown()
			await DeleteSource.call({ id: calendar('Allotment').id })
			assert.deepEqual((await shown())[0]!.calendars.sort(), ['Home', 'Work'])
		})
	})

	describe('two accounts', () => {
		it('never see each other\'s integrations or calendars', async () => {
			current = stranger
			try {
				assert.deepEqual(await shown(), [{ type: 'mitra', calendars: ['Private'] }])
			} finally {
				current = owner
			}
			assert.ok(!(await shown()).some(integration => integration.calendars.includes('Private')))
		})

		it('cannot rename another account\'s calendar', async () => {
			current = stranger
			await shown()
			const theirs = calendar('Private').id
			current = owner
			await assert.rejects(() => RenameSource.call({ id: theirs, name: 'Taken' }))
			current = stranger
			try {
				await shown()
				assert.equal(calendar('Private').name, 'Private')
			} finally {
				current = owner
			}
		})
	})
})
