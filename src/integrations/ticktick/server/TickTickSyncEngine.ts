import { type EntityManager } from '@mikro-orm/sqlite'
import { Source } from '#features/sources'
import { Entry, EntryPatch } from '#features/entries'
import { TimeZone } from '#features/time/TimeZone.js'
import type { Integration, AccountSyncEngine } from '#integrations'
import { createLogger } from '#infrastructure/logging/Logger.js'
import { TickTick, type TickTickTask } from '../TickTick.js'
import { TickTickClient, TickTickRequestError } from './TickTickClient.js'

const logger = createLogger('TickTick')

interface TickTickSyncState {
	/** The inbox's own id, which its tasks name and writes to it take; the API reads it as `inbox` too. */
	inboxId?: string
}

/**
 * Every pass reads each enabled list whole: its undone tasks, those completed in the last {@link completedWindow}, and the
 * abandoned ones starting from then up to {@link abandonedAhead}. A task in none leaves Mitra; a row whose version did not
 * change is left as it is.
 */
export class TickTickSyncEngine implements AccountSyncEngine {
	static readonly completedWindow = { days: 90 }
	static readonly abandonedAhead = { days: 3660 }

	constructor(private readonly clientOf: (integration: TickTick) => TickTickClient = integration => new TickTickClient(integration.credentials.token)) { }

	private client(integration: TickTick) {
		return this.clientOf(integration)
	}

	private static refusal(error: unknown) {
		return error instanceof TickTickRequestError && (error.status === 401 || error.status === 403)
			? new Error('TickTick refused the API token. Create one again in the TickTick web app under Settings, Account, API Token')
			: error
	}

	async fetchSources(integration: Integration) {
		const ticktick = integration as TickTick
		const client = this.client(ticktick)
		const [preference, projects] = await Promise.all([client.preference(), client.projects()]).catch((error: unknown) => {
			throw TickTickSyncEngine.refusal(error)
		})
		ticktick.uri = TickTick.accountUri
		ticktick.credentials = { ...ticktick.credentials, timeZone: TimeZone.parse(preference?.timeZone)?.id ?? '' }
		return TickTick.sourcesFrom(projects ?? [])
	}

	/** The id a write to `source` takes: the inbox's own once a read learned it. */
	private projectIdOf(ticktick: TickTick, source: Pick<Source, 'uri'>) {
		const id = TickTick.projectIdOf(source)
		return id === TickTick.inbox ? (ticktick.syncState as TickTickSyncState | undefined)?.inboxId ?? id : id
	}

	async syncAccountEntries(integration: Integration, em: EntityManager, sources: ReadonlyArray<Source>) {
		if (!sources.length) {
			return false
		}
		const ticktick = integration as TickTick
		const client = this.client(ticktick)
		const until = Temporal.Now.instant()
		const since = until.toZonedDateTimeISO('UTC').subtract(TickTickSyncEngine.completedWindow).toInstant()
		const ahead = until.toZonedDateTimeISO('UTC').add(TickTickSyncEngine.abandonedAhead).toInstant()
		const read = new Map<string, { task: TickTickTask, source: Source }>()
		for (const source of sources) {
			const data = await client.projectData(TickTick.projectIdOf(source))
			if (TickTick.projectIdOf(source) === TickTick.inbox) {
				const inboxId = data?.project?.id ?? data?.tasks?.[0]?.projectId
				if (inboxId) {
					ticktick.syncState = { ...ticktick.syncState, inboxId } satisfies TickTickSyncState
				}
			}
			const projectId = this.projectIdOf(ticktick, source)
			const completed = await client.completedTasks(projectId, new Date(since.epochMilliseconds), new Date(until.epochMilliseconds))
			const abandoned = await client.abandonedTasks(projectId, new Date(since.epochMilliseconds), new Date(ahead.epochMilliseconds))
			for (const task of [...data?.tasks ?? [], ...completed, ...abandoned]) {
				read.set(task.id, { task, source })
			}
		}
		const changed = await this.apply(ticktick, em, sources, read)
		logger.debug(`Synced ${ticktick.toString()}: ${read.size} tasks read${changed ? '' : ' (no local changes)'}`)
		return changed
	}

	/** Upserts what was read, moving an entry whose task changed list, and removes the entries whose task was not. */
	private async apply(ticktick: TickTick, em: EntityManager, sources: ReadonlyArray<Source>, read: ReadonlyMap<string, { task: TickTickTask, source: Source }>) {
		const byUri = new Map<string, Entry>()
		for (const source of sources) {
			for (const entry of await ticktick.syncedEntries(em, source)) {
				if (entry.uri) {
					byUri.set(entry.uri, entry)
				}
			}
		}
		const zone = TickTick.zoneOf(ticktick)
		let changed = false
		for (const { task, source } of read.values()) {
			const entry = byUri.get(task.id)
			const version = TickTick.versionOf(task)
			if (entry && entry.sourceId === source.id && version && entry.data?.etag === version) {
				continue
			}
			const before = entry?.clone()
			const target = entry ?? new Entry({ id: crypto.randomUUID(), sourceId: source.id })
			if (!entry) {
				em.persist(target)
			}
			target.sourceId = source.id
			TickTick.applyTask(target, task, zone)
			changed ||= !before || !before.equals(target)
		}
		for (const [uri, entry] of byUri) {
			if (!read.has(uri)) {
				em.remove(entry)
				changed = true
			}
		}
		return changed
	}

	// --- Writes -----------------------------------------------------------------------------------

	/**
	 * Reads the task back as TickTick settled it: a completed repeating task comes back open at its next date. A failed
	 * read-back leaves the entry as written for the next sync.
	 */
	private async adopt(ticktick: TickTick, entry: Entry, projectId: string, taskId: string) {
		try {
			TickTick.applyTask(entry, await this.client(ticktick).task(projectId, taskId), TickTick.zoneOf(ticktick))
		} catch (error) {
			logger.warn(`Wrote task ${taskId} to ${ticktick.toString()} but could not read it back; the next sync brings it: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async createEntry(integration: Integration, em: EntityManager, entry: Entry) {
		const ticktick = integration as TickTick
		const client = this.client(ticktick)
		const source = await em.findOneOrFail(Source, { id: entry.sourceId })
		const projectId = this.projectIdOf(ticktick, source)
		const { id: _id, ...task } = TickTick.taskFrom(entry, undefined, { projectId, zone: TickTick.zoneOf(ticktick) })
		const created = await client.createTask(task)
		if (!created?.id) {
			throw new Error('TickTick did not say which task it created')
		}
		entry.uri = entry.uid = created.id
		const createdIn = created.projectId || projectId
		if (entry.done) {
			await client.completeTask(createdIn, created.id)
		}
		await this.adopt(ticktick, entry, createdIn, created.id)
		em.persist(entry)
		return entry
	}

	/** Writes over the task as TickTick holds it now, moving it first when it changed list, then completes it. */
	async updateEntry(integration: Integration, em: EntityManager, existing: Entry, incoming: Entry) {
		const ticktick = integration as TickTick
		const client = this.client(ticktick)
		const id = existing.uri
		if (!id) {
			throw new Error('This entry has no TickTick task id')
		}
		const target = await em.findOneOrFail(Source, { id: incoming.sourceId })
		const to = this.projectIdOf(ticktick, target)
		const stored = TickTick.storedTaskOf(existing)
		const current = await client.task(stored?.projectId ?? to, id)
		const moving = current.projectId !== to && !(to === TickTick.inbox && current.projectId.startsWith(TickTick.inbox))
		if (moving) {
			await client.moveTask(current.projectId, to, id)
		}
		const projectId = moving ? to : current.projectId
		await client.updateTask({ ...TickTick.taskFrom(incoming, current, { projectId, zone: TickTick.zoneOf(ticktick) }), id })
		if (incoming.done && current.status !== TickTick.status.completed) {
			await client.completeTask(projectId, id)
		}
		existing.equate(incoming)
		existing.sourceId = target.id
		await this.adopt(ticktick, existing, projectId, id)
	}

	async deleteEntry(integration: Integration, em: EntityManager, entry: Entry) {
		const ticktick = integration as TickTick
		if (entry.uri) {
			const projectId = TickTick.storedTaskOf(entry)?.projectId ?? this.projectIdOf(ticktick, await em.findOneOrFail(Source, { id: entry.sourceId }))
			try {
				await this.client(ticktick).deleteTask(projectId, entry.uri)
			} catch (error) {
				if (!(error instanceof TickTickRequestError) || error.status !== 404) {
					throw error
				}
			}
		}
		em.remove(entry)
	}

	excludeOccurrence(): Promise<void> {
		return Promise.reject(EntryPatch.occurrencesRefused)
	}
}
