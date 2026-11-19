import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MikroORM, UnderscoreNamingStrategy, type EntityManager } from '@mikro-orm/sqlite'
import { children } from '#infrastructure/model'
import { User } from '#features/identity'
import { Source, Color } from '#features/sources'
import { Entry, EntryType } from '#features/entries'
import { Integration, IntegrationCapabilities } from '#integrations'
import { MitraCalendar } from './MitraCalendar.js'

async function inMemoryOrm() {
	const orm = await MikroORM.init({
		entities: [User, Integration, MitraCalendar, Source, Entry],
		dbName: ':memory:',
		subscribers: [children.subscriber],
		forceUndefined: true,
		namingStrategy: class extends UnderscoreNamingStrategy {
			override joinColumnName(propertyName: string) {
				return this.propertyToColumnName(propertyName)
			}

			override joinKeyColumnName(entityName: string) {
				return this.propertyToColumnName(entityName)
			}
		},
		allowGlobalContext: true,
	})
	await orm.schema.update()
	return orm
}

let orm: MikroORM
let users = 0

/** A fresh user with a mitra integration holding one calendar and one entry in it. */
async function seed(em: EntityManager) {
	const user = new User({ username: `user-${++users}` })
	const integration = new MitraCalendar({ userId: user.id })
	em.persist([user, integration])
	await em.flush()

	const source = new Source({ name: 'Personal', enabled: true })
	await integration.createSource(em, source)
	const entry = new Entry({ id: crypto.randomUUID(), uid: crypto.randomUUID(), sourceId: source.id, type: EntryType.Event, heading: 'Dentist' })
	em.persist(entry)
	await em.flush()

	return { user, integration, source, entry }
}

describe('MitraCalendar', () => {
	before(async () => { orm = await inMemoryOrm() })
	after(async () => { await orm.close(true) })

	describe('capabilities', () => {
		it('manages its own sources, since no remote discovery can', () => {
			const capabilities = new MitraCalendar().capabilities
			assert.equal(capabilities.sources.create, true)
			assert.equal(capabilities.sources.delete, true)
		})

		it('every other integration declares source management off by default', () => {
			assert.equal(new IntegrationCapabilities().sources.create, false)
			assert.equal(new IntegrationCapabilities().sources.delete, false)
		})

		it('a read-only calendar cannot be deleted from mitra either', () => {
			const masked = new MitraCalendar().capabilitiesFor({ readOnly: true })
			assert.equal(masked.sources.delete, false)
			assert.equal(masked.sources.create, true) // integration-level, so never masked per source
		})

		it('is never polled: the pacer skips a local-only integration outright', () => {
			assert.equal(new MitraCalendar().syncInterval, Infinity)
			assert.equal(Number.isFinite(new MitraCalendar().syncInterval), false)
		})

		it('declares what the add dialog and sidebar need to know about it', () => {
			assert.equal(MitraCalendar.onePerUser, true)
			assert.equal(MitraCalendar.discoversSources, false)
			assert.equal(new MitraCalendar().reimportable, false)
		})

		it('every other integration keeps the defaults', () => {
			assert.equal(Integration.onePerUser, false)
			assert.equal(Integration.discoversSources, true)
		})
	})

	describe('updateEntry', () => {
		it('takes the edit over in place, the dates it excludes included: an entry kept here has no provider to write to', async () => {
			const em = orm.em.fork()
			const { integration, entry } = await seed(em)
			entry.exdates = [1]
			await em.flush()

			const edited = entry.clone()
			edited.heading = 'Dentist, moved'
			edited.exdates = [1, 2]
			await integration.updateEntry(em, entry, edited)
			await em.flush()

			const stored = await orm.em.fork().findOneOrFail(Entry, { id: entry.id })
			assert.equal(stored.heading, 'Dentist, moved')
			assert.deepEqual(stored.exdates, [1, 2])
		})

		it('keeps the excluded dates an edit says nothing about', async () => {
			const em = orm.em.fork()
			const { integration, entry } = await seed(em)
			entry.exdates = [1]
			await em.flush()

			const edited = entry.clone()
			edited.exdates = undefined
			edited.heading = 'Dentist, renamed'
			await integration.updateEntry(em, entry, edited)
			await em.flush()

			const stored = await orm.em.fork().findOneOrFail(Entry, { id: entry.id })
			assert.equal(stored.heading, 'Dentist, renamed')
			assert.deepEqual(stored.exdates, [1])
		})
	})

	describe('source reconcile', () => {
		it('survives a reconcile, since the stored sources are the provider', async () => {
			const em = orm.em.fork()
			const { integration, source, entry } = await seed(em)

			const reconciled = await integration.getSources(em)
			await em.flush()

			assert.deepEqual(reconciled.map(s => s.id), [source.id])
			assert.equal(await em.count(Source, { integrationId: integration.id }), 1)
			assert.equal(await em.count(Entry, { id: entry.id }), 1)
		})

		/** Returning [] from fetchSources would make getSources delete every stored source. */
		it('an Edit → Save round-trip does not cascade-delete the calendars and their entries', async () => {
			const em = orm.em.fork()
			const { integration, source, entry } = await seed(em)

			// A separate context, like the API, which loads the calendars afresh.
			const listing = orm.em.fork()
			const served = await listing.findOneOrFail(MitraCalendar, { id: integration.id })
			await integration.apply(em, served.clone())
			await em.flush()

			assert.equal(await em.count(Source, { integrationId: integration.id }), 1, 'the calendar survived')
			assert.equal(await em.count(Entry, { id: entry.id }), 1, 'its entries survived')
			assert.equal((await em.findOneOrFail(Source, { id: source.id })).enabled, true)
		})

		it('the copy the edit dialog shows keeps an imported calendar imported, in its color', async () => {
			const em = orm.em.fork()
			const { integration, source } = await seed(em)
			source.color = Color.parse('#123456')
			await em.flush()

			const served = await orm.em.fork().findOneOrFail(MitraCalendar, { id: integration.id })
			const [copy] = [...served.clone().sources]
			assert.equal(copy!.importing, false)
			assert.equal(copy!.color, Color.parse('#123456'))
		})

		it('a background sync changes nothing and reports no change', async () => {
			const em = orm.em.fork()
			const { integration, source } = await seed(em)

			assert.equal(await integration.sync(em), false)
			assert.equal(await em.count(Source, { id: source.id }), 1)
		})

		it('re-import is a no-op, since wiping and refetching would destroy the only copy', async () => {
			const em = orm.em.fork()
			const { integration, source, entry } = await seed(em)

			await integration.reimportSource(em, source)
			await em.flush()

			assert.equal(await em.count(Entry, { id: entry.id }), 1)
		})
	})

	describe('source management', () => {
		it('mints a uri for a created calendar and files it under the integration', async () => {
			const em = orm.em.fork()
			const { integration } = await seed(em)

			const source = new Source({ name: 'Work' })
			await integration.createSource(em, source)
			await em.flush()

			assert.equal(source.integrationId, integration.id)
			assert.equal(source.uri, `mitra://calendar/${source.id}`)
			assert.equal((await em.findOneOrFail(Source, { id: source.id })).name, 'Work')
		})

		it('holds events and tasks unless told otherwise', async () => {
			const em = orm.em.fork()
			const { integration } = await seed(em)
			const source = new Source({ name: 'Work' })
			await integration.createSource(em, source)
			assert.equal(source.supportsEntryType(EntryType.Event), true)
			assert.equal(source.supportsEntryType(EntryType.Task), true)
		})

		it('deleting a calendar takes its entries with it', async () => {
			const em = orm.em.fork()
			const { integration, source } = await seed(em)

			await integration.deleteSource(em, source)
			await em.flush()

			assert.equal(await em.count(Source, { id: source.id }), 0)
			assert.equal(await em.count(Entry, { sourceId: source.id }), 0)
		})

		it('leaves the integration and its other calendars standing', async () => {
			const em = orm.em.fork()
			const { integration, source } = await seed(em)
			const kept = new Source({ name: 'Work' })
			await integration.createSource(em, kept)
			await em.flush()

			await integration.deleteSource(em, source)
			await em.flush()

			assert.equal(await em.count(Integration, { id: integration.id }), 1)
			assert.deepEqual((await em.find(Source, { integrationId: integration.id })).map(s => s.name), ['Work'])
		})

		it('a provider that declares no source management has no operation to reach for', async () => {
			const em = orm.em.fork()
			const { integration } = await seed(em)
			// The route gates on the capability; this is the backstop behind it.
			await assert.rejects(
				() => Promise.resolve().then(() => Integration.prototype.createSource.call(integration, em, new Source({ name: 'x' }))),
				/sync engine/,
			)
		})
	})

	describe('one per account', () => {
		it('a second mitra integration collides on the uri the first already claims', async () => {
			const em = orm.em.fork()
			const { user } = await seed(em)

			em.persist(new MitraCalendar({ userId: user.id }))
			await assert.rejects(() => em.flush())
		})

		it('but two accounts each get their own', async () => {
			const em = orm.em.fork()
			await seed(em)
			await seed(em)
			assert.equal((await em.find(MitraCalendar, {})).length >= 2, true)
		})
	})
})
