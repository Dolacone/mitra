import { createLogger } from '#infrastructure/logging/Logger.js'
import { TickTick, type TickTickProject, type TickTickTask, type TickTickTaskWrite } from '../TickTick.js'

const logger = createLogger('TickTick')

export class TickTickRequestError extends Error {
	constructor(readonly status: number, message: string) {
		super(message)
	}
}

export interface TickTickProjectData {
	project?: TickTickProject
	/** Its undone tasks. */
	tasks?: Array<TickTickTask>
}

/** TickTick's Open API with a personal API token. */
export class TickTickClient {
	static readonly baseUrl = 'https://api.ticktick.com/open/v1/'
	/** The most `task/completed` and `task/filter` answer at once. */
	static readonly answerLimit = 200
	private static readonly maxRetryAfterSeconds = 30

	constructor(
		private readonly token: string,
		private readonly fetchImplementation: typeof fetch = fetch,
	) { }

	preference() {
		return this.request<{ timeZone?: string }>('POST', 'preference')
	}

	projects() {
		return this.request<Array<TickTickProject>>('GET', 'project')
	}

	projectData(projectId: string) {
		return this.request<TickTickProjectData>('GET', `project/${encodeURIComponent(projectId)}/data`)
	}

	task(projectId: string, taskId: string) {
		return this.request<TickTickTask>('GET', `project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`)
	}

	/** Tasks of `projectId` completed in `[since, until]`. */
	completedTasks(projectId: string, since: Date, until: Date) {
		return TickTickClient.windowed(since, until, (from, to) =>
			this.request<Array<TickTickTask>>('POST', 'task/completed', { projectIds: [projectId], startDate: TickTickClient.formatOf(from), endDate: TickTickClient.formatOf(to) }))
	}

	/** Abandoned tasks of `projectId` starting in `[since, until]`; the other reads leave them out, and an undated one is in no window. */
	abandonedTasks(projectId: string, since: Date, until: Date) {
		return TickTickClient.windowed(since, until, (from, to) =>
			this.request<Array<TickTickTask>>('POST', 'task/filter', { projectIds: [projectId], status: [TickTick.status.abandoned], startDate: TickTickClient.formatOf(from), endDate: TickTickClient.formatOf(to) }))
	}

	/** What `read` answers for `[since, until]`, the window halved until each part answers under the limit, each task once. */
	private static async windowed(since: Date, until: Date, read: (since: Date, until: Date) => Promise<Array<TickTickTask> | undefined>): Promise<Array<TickTickTask>> {
		const tasks = await read(since, until) ?? []
		const span = until.getTime() - since.getTime()
		if (tasks.length < TickTickClient.answerLimit || span <= 60_000) {
			return tasks
		}
		const middle = new Date(since.getTime() + Math.floor(span / 2))
		const halves = [...await TickTickClient.windowed(since, middle, read), ...await TickTickClient.windowed(new Date(middle.getTime() + 1000), until, read)]
		return [...new Map(halves.map(task => [task.id, task])).values()]
	}

	createTask(task: TickTickTaskWrite) {
		return this.request<TickTickTask>('POST', 'task', task)
	}

	updateTask(task: TickTickTaskWrite & Pick<TickTickTask, 'id'>) {
		return this.request<TickTickTask>('POST', `task/${encodeURIComponent(task.id)}`, task)
	}

	completeTask(projectId: string, taskId: string) {
		return this.request<unknown>('POST', `project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`)
	}

	moveTask(fromProjectId: string, toProjectId: string, taskId: string) {
		return this.request<unknown>('POST', 'task/move', [{ fromProjectId, toProjectId, taskId }])
	}

	deleteTask(projectId: string, taskId: string) {
		return this.request<unknown>('DELETE', `project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`)
	}

	/** `yyyy-MM-dd'T'HH:mm:ssZ` in UTC, the form the Open API reads. */
	static formatOf(instant: Date) {
		return `${instant.toISOString().slice(0, 19)}+0000`
	}

	private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, isRetry = false): Promise<T> {
		const response = await this.fetchImplementation(new URL(path, TickTickClient.baseUrl), {
			method,
			headers: {
				'Authorization': `Bearer ${this.token}`,
				...body === undefined ? {} : { 'Content-Type': 'application/json' },
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		})

		if (response.status === 429 && !isRetry) {
			const retryAfter = Number(response.headers.get('Retry-After')) || 1
			if (retryAfter <= TickTickClient.maxRetryAfterSeconds) {
				logger.debug(`Rate limited on ${path}, retrying in ${retryAfter}s`)
				await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
				return this.request<T>(method, path, body, true)
			}
		}

		const text = await response.text().catch(() => '')
		if (!response.ok) {
			// The answer alone, never the request, which carries the token.
			throw new TickTickRequestError(response.status, `TickTick request failed (${response.status}): ${text.slice(0, 300) || response.statusText}`)
		}
		return (text ? JSON.parse(text) : undefined) as T
	}
}
