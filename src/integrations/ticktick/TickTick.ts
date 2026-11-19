import { converter } from '@a11d/converter'
import { Source, Color } from '#features/sources'
import { type Entry, EntryType, EntryStatus } from '#features/entries'
import { Checklist } from '#features/entries/Checklist.js'
import { Recurrence } from '#features/recurrence'
import { EntryTimeZone } from '#features/time/EntryTimeZone.js'
import { TimeZone } from '#features/time/TimeZone.js'
import { Integration, integration, IntegrationCapabilities, IntegrationOwnership } from '#integrations'
import { model, withheld } from '#infrastructure/model'

export interface TickTickCredentials {
	/** A personal API token (TickTick web: Settings, Account, API Token). */
	token: string
	/** The account's zone, where a time Mitra holds without one is written. */
	timeZone: string
}

export interface TickTickChecklistItem {
	id?: string
	title?: string
	/** 0 open, 1 done. */
	status?: number
	sortOrder?: number
	[field: string]: unknown
}

/** A task as the Open API serves it. Fields Mitra does not read (priority, tags, reminders) ride along untouched. */
export interface TickTickTask {
	id: string
	projectId: string
	title?: string
	content?: string | null
	desc?: string | null
	kind?: 'TEXT' | 'NOTE' | 'CHECKLIST'
	isAllDay?: boolean
	startDate?: string | null
	dueDate?: string | null
	timeZone?: string | null
	repeatFlag?: string | null
	/** 0 open, 2 completed, -1 abandoned. */
	status?: number
	items?: Array<TickTickChecklistItem> | null
	etag?: string
	modifiedTime?: string
	[field: string]: unknown
}

/** What a write carries of a task: no id when it creates one. */
export type TickTickTaskWrite = Partial<TickTickTask> & Pick<TickTickTask, 'projectId'>

export interface TickTickProject {
	id: string
	name: string
	color?: string | null
	sortOrder?: number
	closed?: boolean
	/** `read`, `write` or `comment`. */
	permission?: string
}

/** TickTick projects as task calendars: a task's start and due date are its schedule, its status open, completed or abandoned. */
@model('TickTick')
@integration('ticktick')
export class TickTick extends Integration<TickTickCredentials> {
	static readonly label: string = 'TickTick'
	static readonly logo: string = 'ticktick'
	static readonly description: string = 'The tasks of your TickTick lists'
	static override readonly docs: string | undefined = 'integrations/ticktick'
	static override readonly onePerUser: boolean = true

	static readonly accountUri = 'ticktick://account'
	static readonly projectPrefix = 'ticktick://project/'
	/** The id the Open API takes for the inbox, which `GET /project` does not list. */
	static readonly inbox = 'inbox'

	static readonly status = { open: 0, completed: 2, abandoned: -1 } as const

	static sourceUri(projectId: string) {
		return `${TickTick.projectPrefix}${projectId}`
	}

	static projectIdOf(source: Pick<Source, 'uri'>) {
		const id = source.uri.startsWith(TickTick.projectPrefix) ? source.uri.slice(TickTick.projectPrefix.length) : ''
		if (!id) {
			throw new Error(`Not a TickTick source uri: ${source.uri}`)
		}
		return id
	}

	@converter(withheld<TickTickCredentials>('token')) override credentials!: TickTickCredentials

	constructor(init?: Partial<TickTick>) {
		super()
		this.credentials = { token: '', timeZone: '' }
		Object.assign(this, init)
	}

	override toString() {
		return `TickTick integration${this.id ? ` ${this.id}` : ' (new)'}`
	}

	/** Tasks only, moved between lists in place, never one date of a repeating task apart from the rest. */
	override get capabilities() {
		return new IntegrationCapabilities({
			entries: { statuses: [EntryStatus.ToDo, EntryStatus.Done, EntryStatus.Cancelled], attach: false, floating: false, move: true, occurrences: false },
			availability: false,
		})
	}

	override get ownership() {
		return new IntegrationOwnership({
			description: 'upstream', allDay: 'upstream', timeZone: 'upstream', recurrence: 'upstream',
			rank: 'mitra',
		})
	}

	override get canConnect() {
		return !!this.credentials.token
	}

	override get syncInterval() { return 60_000 }

	override get momentMinutes() { return 30 }

	override merge(incoming: this) {
		this.credentials = {
			token: incoming.credentials?.token || this.credentials.token,
			timeZone: this.credentials.timeZone ?? '',
		}
	}

	/** The zone a time without one of its own is read and written in. */
	static zoneOf(integration: { credentials: Pick<TickTickCredentials, 'timeZone'> }) {
		return TimeZone.parse(integration.credentials.timeZone) ?? TimeZone.UTC
	}

	// --- Projects ---------------------------------------------------------------------------------

	/** The open lists as calendars, the inbox first, then in TickTick's order. A list shared to read or comment is read-only. */
	static sourcesFrom(projects: ReadonlyArray<TickTickProject>) {
		const inbox = new Source({ uri: TickTick.sourceUri(TickTick.inbox), name: 'Inbox', entryTypes: [EntryType.Task], color: Color.derivedFrom(TickTick.sourceUri(TickTick.inbox)), enabled: false })
		const lists = projects
			.filter(project => !project.closed)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
			.map(project => {
				const uri = TickTick.sourceUri(project.id)
				const readOnly = project.permission === 'read' || project.permission === 'comment'
				return new Source({ uri, name: project.name, entryTypes: [EntryType.Task], color: Color.parse(project.color) ?? Color.derivedFrom(uri), enabled: false, ...readOnly ? { readOnly } : {} })
			})
		return [inbox, ...lists]
	}

	// --- Reading ----------------------------------------------------------------------------------

	/** `2026-12-16T00:00:00+0800`, the Open API's form, as an instant. */
	static instantOf(value: string | null | undefined) {
		if (!value) {
			return undefined
		}
		const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
		return Number.isNaN(date.getTime()) ? undefined : date
	}

	/**
	 * The schedule a task's dates stand for: equal start and due a day or a moment, a later due the end. An all-day span's
	 * due is the midnight after its last day.
	 */
	static scheduleOf(task: Pick<TickTickTask, 'startDate' | 'dueDate' | 'isAllDay' | 'timeZone'>, zone: TimeZone): Pick<Entry, 'start' | 'end' | 'allDay' | 'timeZone'> {
		const start = TickTick.instantOf(task.startDate) ?? TickTick.instantOf(task.dueDate)
		const due = TickTick.instantOf(task.dueDate) ?? start
		if (!start || !due) {
			return { start: undefined, end: undefined, allDay: false, timeZone: undefined }
		}
		if (task.isAllDay) {
			const clock = TimeZone.parse(task.timeZone) ?? zone
			const first = clock.dayOf(start)
			const days = Math.max(1, first.until(clock.dayOf(due)).days)
			return { start: TimeZone.UTC.midnightOf(first) as never, end: TimeZone.UTC.midnightOf(first.add({ days })) as never, allDay: true, timeZone: undefined }
		}
		return {
			start: start as never,
			end: due.getTime() > start.getTime() ? due as never : undefined,
			allDay: false,
			timeZone: EntryTimeZone.parse(task.timeZone),
		}
	}

	/** A checklist's description is its text, then each item as a Markdown task line. */
	static descriptionOf(task: Pick<TickTickTask, 'kind' | 'content' | 'desc' | 'items'>) {
		if (task.kind !== 'CHECKLIST') {
			return task.content ?? ''
		}
		const lines = (task.items ?? []).map(item => `- [${item.status === 1 ? 'x' : ' '}] ${item.title ?? ''}`)
		return [task.desc ?? '', lines.join('\n')].filter(Boolean).join('\n\n')
	}

	static statusOf(status: number | undefined) {
		return status === TickTick.status.completed ? EntryStatus.Done
			: status === TickTick.status.abandoned ? EntryStatus.Cancelled
				: EntryStatus.ToDo
	}

	/** A rule Mitra repeats by; an `ERULE` (a list of dates) or a rule it cannot read stands for none. */
	static recurrenceOf(repeatFlag: string | null | undefined) {
		return repeatFlag && /^RRULE:/i.test(repeatFlag) ? Recurrence.fromRRule(repeatFlag) : undefined
	}

	/** Maps a task onto `entry`, keeping the task itself so a write leaves what Mitra does not show as it is. */
	static applyTask(entry: Entry, task: TickTickTask, zone: TimeZone) {
		const schedule = TickTick.scheduleOf(task, zone)
		entry.type = EntryType.Task
		entry.uri = task.id
		entry.uid = task.id
		entry.heading = task.title || 'Untitled Task'
		entry.description = TickTick.descriptionOf(task)
		entry.status = TickTick.statusOf(task.status)
		entry.start = schedule.start
		entry.end = schedule.end
		entry.allDay = schedule.allDay
		entry.timeZone = schedule.timeZone
		entry.recurrence = schedule.start ? TickTick.recurrenceOf(task.repeatFlag) : undefined
		entry.exdates = undefined
		entry.due = undefined
		entry.estimate = undefined
		entry.percentComplete = undefined
		entry.location = ''
		entry.color = undefined
		entry.reminders = undefined
		entry.transparency = undefined
		entry.visibility = undefined
		entry.data = { raw: JSON.stringify(task), etag: TickTick.versionOf(task) }
	}

	/** What tells a task's versions apart, where the API says one. */
	static versionOf(task: Pick<TickTickTask, 'etag' | 'modifiedTime'>) {
		return task.etag ?? task.modifiedTime ?? undefined
	}

	static storedTaskOf(entry: Pick<Entry, 'data'>) {
		try {
			return entry.data?.raw ? JSON.parse(entry.data.raw) as TickTickTask : undefined
		} catch {
			return undefined
		}
	}

	// --- Writing ----------------------------------------------------------------------------------

	/** `instant` in the Open API's form, on `zone`'s clock. */
	static formatOf(instant: Date, zone: TimeZone) {
		const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(zone.id)
		return `${zoned.toPlainDateTime().toString({ smallestUnit: 'second' })}${zoned.offset.replace(':', '')}`
	}

	/** The one date `entry`'s schedule starts on, as equal start and due, in the zone the task keeps unless the entry names another. */
	static datesFrom(entry: Pick<Entry, 'start' | 'allDay' | 'timeZone'>, stored: Pick<TickTickTask, 'timeZone'> | undefined, zone: TimeZone) {
		const start = entry.start as Date | undefined
		const kept = TimeZone.parse(stored?.timeZone) ?? zone
		if (!start) {
			return { startDate: null, dueDate: null, isAllDay: false, timeZone: kept.id }
		}
		if (entry.allDay) {
			const startDate = TickTick.formatOf(kept.midnightOf(TimeZone.UTC.dayOf(start)), kept)
			return { startDate, dueDate: startDate, isAllDay: true, timeZone: kept.id }
		}
		const clock = !entry.timeZone || entry.timeZone.floating ? kept : entry.timeZone.clock
		const startDate = TickTick.formatOf(start, clock)
		return { startDate, dueDate: startDate, isAllDay: false, timeZone: clock.id }
	}

	/** The task's text: a checklist's items from the description's task lines, each keeping the id of the item at its place. */
	static textFrom(description: string | undefined, stored: Pick<TickTickTask, 'kind' | 'items'> | undefined): Partial<TickTickTask> {
		const text = description ?? ''
		if (stored?.kind !== 'CHECKLIST') {
			return { content: text }
		}
		const checklist = Checklist.of(text)
		const lines = new Set(checklist.items.map(item => item.line))
		const desc = text.split('\n').filter((_, line) => !lines.has(line)).join('\n').trim()
		const items = checklist.items.map((item, index) => ({
			...stored.items?.[index],
			title: item.text,
			status: item.checked ? 1 : 0,
			sortOrder: stored.items?.[index]?.sortOrder ?? index,
		}))
		return { desc, items }
	}

	/** The rule as an `RRULE`; one Mitra could not read stays as TickTick has it. */
	static repeatFlagFrom(entry: Pick<Entry, 'recurrence' | 'allDay'>, stored: Pick<TickTickTask, 'repeatFlag'> | undefined) {
		if (entry.recurrence) {
			return `RRULE:${entry.recurrence.toRRule(entry.allDay)}`
		}
		return stored?.repeatFlag && !TickTick.recurrenceOf(stored.repeatFlag) ? stored.repeatFlag : null
	}

	/** The status a write carries: completing is the complete endpoint's, which moves a repeating task on. */
	static statusFrom(entry: Pick<Entry, 'status'>, stored: Pick<TickTickTask, 'status'> | undefined) {
		return entry.status === EntryStatus.Cancelled ? TickTick.status.abandoned
			: entry.status === EntryStatus.Done ? stored?.status ?? TickTick.status.open
				: TickTick.status.open
	}

	/** `stored` with what Mitra holds of `entry` over it, so priority, tags, reminders and the rest stay. */
	static taskFrom(entry: Entry, stored: TickTickTask | undefined, { projectId, zone }: { projectId: string, zone: TimeZone }): TickTickTaskWrite {
		return {
			...stored ?? { kind: 'TEXT' },
			projectId,
			title: entry.heading,
			...TickTick.textFrom(entry.description, stored),
			...TickTick.datesFrom(entry, stored, zone),
			repeatFlag: TickTick.repeatFlagFrom(entry, stored),
			status: TickTick.statusFrom(entry, stored),
		}
	}
}
