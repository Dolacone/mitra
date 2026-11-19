import { TickTick, type TickTickProject, type TickTickTask, type TickTickTaskWrite } from '../TickTick.js'
import { type TickTickClient, TickTickRequestError } from './TickTickClient.js'
import { TickTickSyncEngine } from './TickTickSyncEngine.js'

export const task = (init: Partial<TickTickTask> & Pick<TickTickTask, 'id' | 'projectId'>): TickTickTask =>
	({ title: init.id, kind: 'TEXT', status: 0, timeZone: 'Asia/Taipei', etag: `${init.id}-0`, ...init })

/** A TickTick account as the Open API answers for it, keeping what was written to it. */
export class TickTickAccount {
	readonly inboxId = 'inbox1'
	refusal?: Error
	readonly projects: Array<TickTickProject> = [
		{ id: 'p2', name: 'Home', sortOrder: 2, color: '#F18181' },
		{ id: 'p1', name: 'Work', sortOrder: 1 },
		{ id: 'p3', name: 'Shared', sortOrder: 3, permission: 'read' },
		{ id: 'p4', name: 'Archive', sortOrder: 4, closed: true },
	]
	readonly tasks = new Map<string, TickTickTask>()
	readonly written = new Array<TickTickTaskWrite>()
	readonly calls = new Array<string>()
	private versions = 0

	/** An engine that reaches this account instead of TickTick. */
	engine() {
		return new TickTickSyncEngine(() => this.client as unknown as TickTickClient)
	}

	add(...tasks: Array<TickTickTask>) {
		tasks.forEach(task => this.tasks.set(task.id, task))
	}

	/** Changes a task as TickTick does, with a new version. */
	change(id: string, change: Partial<TickTickTask>) {
		const changed = { ...this.found(id), ...change, etag: `${id}-${++this.versions}` }
		this.tasks.set(id, changed)
		return structuredClone(changed)
	}

	private idOf(projectId: string) {
		return projectId === TickTick.inbox ? this.inboxId : projectId
	}

	private found(id: string) {
		const task = this.tasks.get(id)
		if (!task) {
			throw new TickTickRequestError(404, 'Task not found')
		}
		return task
	}

	private in(projectId: string, status: number) {
		return [...this.tasks.values()].filter(task => task.projectId === this.idOf(projectId) && task.status === status).map(task => structuredClone(task))
	}

	/** Answers as a request does: what `work` throws, it refuses. */
	private static answer<T>(work: () => T) {
		return new Promise<T>(resolve => resolve(work()))
	}

	readonly client = {
		preference: () => Promise.resolve({ timeZone: 'Asia/Taipei' }),
		projects: () => this.refusal ? Promise.reject(this.refusal) : Promise.resolve(this.projects),
		projectData: (projectId: string) => Promise.resolve({ tasks: this.in(projectId, TickTick.status.open) }),
		completedTasks: (projectId: string) => Promise.resolve(this.in(projectId, TickTick.status.completed)),
		// Like `task/filter`, which windows by start date: no undated abandoned task.
		abandonedTasks: (projectId: string) => Promise.resolve(this.in(projectId, TickTick.status.abandoned).filter(task => task.startDate)),
		task: (_projectId: string, id: string) => TickTickAccount.answer(() => structuredClone(this.found(id))),
		createTask: (task: TickTickTaskWrite) => TickTickAccount.answer(() => {
			this.written.push(task)
			const id = `t${this.tasks.size + 1}`
			this.tasks.set(id, { status: 0, ...task, id, projectId: this.idOf(task.projectId) })
			return this.change(id, {})
		}),
		// The Open API moves a task only through `task/move`.
		updateTask: (task: TickTickTaskWrite & Pick<TickTickTask, 'id'>) => TickTickAccount.answer(() => {
			this.written.push(task)
			return this.change(task.id, { ...task, projectId: this.found(task.id).projectId })
		}),
		completeTask: (projectId: string, id: string) => TickTickAccount.answer(() => {
			this.calls.push(`complete ${projectId} ${id}`)
			this.change(id, { status: TickTick.status.completed })
		}),
		moveTask: (from: string, to: string, id: string) => TickTickAccount.answer(() => {
			this.calls.push(`move ${from} ${to} ${id}`)
			this.change(id, { projectId: this.idOf(to) })
		}),
		deleteTask: (projectId: string, id: string) => TickTickAccount.answer(() => {
			this.calls.push(`delete ${projectId} ${id}`)
			this.found(id)
			this.tasks.delete(id)
		}),
	}
}
