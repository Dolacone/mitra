import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MikroORM, type EntityManager } from '@mikro-orm/sqlite'
import { User } from '#features/identity'
import { type Source } from '#features/sources'
import { Entry, EntryStatus, EntryType } from '#features/entries'
import { registerEngine } from '#integrations'
import { ormConfig } from '#infrastructure/database/ormConfig.js'
import { migrate } from '#infrastructure/database/migrations/migrate.js'
import { TickTick } from '../TickTick.js'
import { TickTickRequestError } from './TickTickClient.js'
import { TickTickAccount, task } from './TickTickAccount.testing.js'

interface Connected {
	em: EntityManager
	ticktick: TickTick
	account: TickTickAccount
	sources: Array<Source>
	source(name: string): Source
	rows(): Promise<Record<string, [string, string, EntryStatus | undefined]>>
}

/** Connects `account`, every list on unless `enable` is false, runs `test` and closes the database. */
async function connected(test: (context: Connected) => Promise<void>, { account = new TickTickAccount(), enable = true } = {}) {
	const orm = await MikroORM.init(ormConfig(':memory:'))
	try {
		await migrate(orm)
		registerEngine('ticktick', account.engine())
		const em = orm.em.fork()
		const user = new User({ username: 'me' })
		const ticktick = new TickTick({ userId: user.id, credentials: { token: 'token', timeZone: '' } })
		em.persist([user, ticktick])
		const sources = await ticktick.getSources(em)
		sources.forEach(source => source.enabled = enable)
		await em.flush()
		const source = (name: string) => sources.find(source => source.name === name)!
		const rows = async () => Object.fromEntries((await em.find(Entry, {})).map(entry => [entry.uri!, [sources.find(source => source.id === entry.sourceId)!.name, entry.heading, entry.status] as [string, string, EntryStatus | undefined]]))
		await test({ em, ticktick, account, sources, source, rows })
	} finally {
		await orm.close()
	}
}

const synced = async ({ em, ticktick }: Connected) => {
	await ticktick.sync(em)
}

describe('TickTickSyncEngine', () => {
	it('finds the inbox and the open lists, off, in the account\'s zone, a list shared to read read-only', () => connected(async ({ em, ticktick, account, sources }) => {
		assert.deepEqual(sources.map(source => [source.name, source.uri, !!source.readOnly, source.enabled]), [
			['Inbox', 'ticktick://project/inbox', false, false],
			['Work', 'ticktick://project/p1', false, false],
			['Home', 'ticktick://project/p2', false, false],
			['Shared', 'ticktick://project/p3', true, false],
		])
		assert.deepEqual([ticktick.uri, ticktick.credentials.timeZone], [TickTick.accountUri, 'Asia/Taipei'])

		account.refusal = new TickTickRequestError(401, 'TickTick request failed (401)')
		await assert.rejects(ticktick.getSources(em), /TickTick refused the API token/)
	}, { enable: false }))

	it('reads the open tasks and those completed lately, into the list each is in', () => connected(async context => {
		context.account.add(
			task({ id: 'open', projectId: 'p1', startDate: '2026-12-16T00:00:00+0800', dueDate: '2026-12-16T00:00:00+0800', isAllDay: true }),
			task({ id: 'done', projectId: 'p1', status: 2 }),
			task({ id: 'jot', projectId: 'inbox1' }),
		)
		await synced(context)
		assert.deepEqual(await context.rows(), {
			open: ['Work', 'open', EntryStatus.ToDo],
			done: ['Work', 'done', EntryStatus.Done],
			jot: ['Inbox', 'jot', EntryStatus.ToDo],
		})
		assert.equal(context.ticktick.syncState?.inboxId, 'inbox1')
	}))

	it('takes what changed, moves what changed list, removes what is gone and leaves a task of the same version as it is', () => connected(async context => {
		const { account } = context
		account.add(task({ id: 'open', projectId: 'p1' }), task({ id: 'done', projectId: 'p1', status: 2 }), task({ id: 'jot', projectId: 'inbox1' }))
		await synced(context)

		account.change('open', { title: 'Renamed', projectId: 'p2' })
		account.tasks.set('done', { ...account.tasks.get('done')!, title: 'Same version' })
		account.tasks.delete('jot')
		account.add(task({ id: 'later', projectId: 'p2' }))
		await synced(context)

		assert.deepEqual(await context.rows(), {
			open: ['Home', 'Renamed', EntryStatus.ToDo],
			done: ['Work', 'done', EntryStatus.Done],
			later: ['Home', 'later', EntryStatus.ToDo],
		})
	}))

	it('keeps a cancelled task, read through the filter, and removes one gone from every read', () => connected(async context => {
		const { account } = context
		account.add(
			task({ id: 'dropped', projectId: 'p1', status: -1, startDate: '2026-12-16T00:00:00+0800', dueDate: '2026-12-16T00:00:00+0800', isAllDay: true }),
			task({ id: 'open', projectId: 'p1' }),
		)
		await synced(context)
		assert.deepEqual(await context.rows(), {
			dropped: ['Work', 'dropped', EntryStatus.Cancelled],
			open: ['Work', 'open', EntryStatus.ToDo],
		})

		account.change('open', { status: -1, startDate: null, dueDate: null })
		await synced(context)
		assert.deepEqual(await context.rows(), {
			dropped: ['Work', 'dropped', EntryStatus.Cancelled],
		})
	}))

	describe('writing', () => {
		const at = (iso: string) => new Date(iso) as never

		it('creates a task in its list, without an id, and completes one made done', () => connected(async ({ em, ticktick, account, source }) => {
			const call = await ticktick.createEntry(em, new Entry({ id: crypto.randomUUID(), sourceId: source('Work').id, type: EntryType.Task, heading: 'Call', start: at('2027-04-01T02:00:00Z') }))
			const written = account.written[0]!
			assert.deepEqual([call.uri, call.uid, 'id' in written, written.projectId, written.title, written.startDate], ['t1', 't1', false, 'p1', 'Call', '2027-04-01T10:00:00+0800'])

			const done = await ticktick.createEntry(em, new Entry({ id: crypto.randomUUID(), sourceId: source('Work').id, type: EntryType.Task, heading: 'Filed', status: EntryStatus.Done }))
			assert.deepEqual(account.calls, ['complete p1 t2'])
			assert.equal(done.status, EntryStatus.Done)
		}))

		it('writes over the task TickTick holds now, keeping what Mitra does not show', () => connected(async context => {
			const { em, ticktick, account } = context
			account.add(task({ id: 'call', projectId: 'p1', priority: 5, tags: ['work'], reminders: ['TRIGGER:PT0S'] }))
			await synced(context)
			const existing = await em.findOneOrFail(Entry, { uri: 'call' })
			account.change('call', { tags: ['work', 'phone'] })

			const incoming = existing.clone()
			incoming.heading = 'Call back'
			await ticktick.updateEntry(em, existing, incoming)

			const written = account.written.at(-1)!
			assert.deepEqual([written.id, written.title, written.priority, written.tags, written.reminders], ['call', 'Call back', 5, ['work', 'phone'], ['TRIGGER:PT0S']])
			assert.equal(existing.heading, 'Call back')
		}))

		it('completes through TickTick\'s completion and reopens by the status it writes', () => connected(async context => {
			const { em, ticktick, account } = context
			account.add(task({ id: 'call', projectId: 'p1' }))
			await synced(context)
			const existing = await em.findOneOrFail(Entry, { uri: 'call' })

			const completed = existing.clone()
			completed.done = true
			await ticktick.updateEntry(em, existing, completed)
			assert.deepEqual([account.calls, account.written.at(-1)!.status, existing.status], [['complete p1 call'], TickTick.status.open, EntryStatus.Done])

			const reopened = existing.clone()
			reopened.done = false
			await ticktick.updateEntry(em, existing, reopened)
			assert.deepEqual([account.calls.length, account.written.at(-1)!.status, existing.status], [1, TickTick.status.open, EntryStatus.ToDo])
		}))

		it('moves a task to another list in place', () => connected(async context => {
			const { em, ticktick, account, source } = context
			account.add(task({ id: 'call', projectId: 'p1' }), task({ id: 'jot', projectId: 'inbox1' }))
			await synced(context)
			const existing = await em.findOneOrFail(Entry, { uri: 'call' })

			const moved = existing.clone()
			moved.sourceId = source('Inbox').id
			await ticktick.updateEntry(em, existing, moved)

			assert.deepEqual([account.calls, account.written.at(-1)!.projectId, account.tasks.get('call')!.projectId, existing.sourceId], [['move p1 inbox1 call'], 'inbox1', 'inbox1', source('Inbox').id])
		}))

		it('deletes a task, and takes one already gone for deleted', () => connected(async context => {
			const { em, ticktick, account } = context
			account.add(task({ id: 'call', projectId: 'p1' }), task({ id: 'gone', projectId: 'p1' }))
			await synced(context)
			const [call, gone] = await Promise.all(['call', 'gone'].map(uri => em.findOneOrFail(Entry, { uri })))
			account.tasks.delete('gone')

			await ticktick.deleteEntry(em, call!)
			await ticktick.deleteEntry(em, gone!)
			await em.flush()

			assert.deepEqual([account.calls, account.tasks.has('call'), await context.rows()], [['delete p1 call', 'delete p1 gone'], false, {}])
		}))

		it('refuses to leave one date of a repeating task out', () => connected(async ({ em, ticktick }) => {
			await assert.rejects(ticktick.excludeOccurrence(em, new Entry({ type: EntryType.Task }), new Date()), /keeps a repeating entry's dates as one/)
		}))
	})
})
