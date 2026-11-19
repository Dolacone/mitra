import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TickTickClient, TickTickRequestError } from './TickTickClient.js'

interface Sent {
	method: string
	url: string
	authorization: string | null
	body: unknown
}

/** A fetch answering each request with `answer`'s response, keeping what was sent. */
function server(answer: (sent: Sent) => Response) {
	const sent = new Array<Sent>()
	const fetch = ((url: URL, init: RequestInit) => {
		const request = { method: init.method!, url: String(url), authorization: new Headers(init.headers).get('Authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined }
		sent.push(request)
		return Promise.resolve(answer(request))
	}) as unknown as typeof globalThis.fetch
	return { sent, client: new TickTickClient('secret', fetch) }
}

describe('TickTickClient', () => {
	it('calls the Open API with the token, and reads an empty answer as none', async () => {
		const { sent, client } = server(() => new Response(null, { status: 200 }))
		assert.equal(await client.completeTask('p1', 't/1'), undefined)
		await client.moveTask('p1', 'p2', 't1')
		assert.deepEqual(sent, [
			{ method: 'POST', url: 'https://api.ticktick.com/open/v1/project/p1/task/t%2F1/complete', authorization: 'Bearer secret', body: undefined },
			{ method: 'POST', url: 'https://api.ticktick.com/open/v1/task/move', authorization: 'Bearer secret', body: [{ fromProjectId: 'p1', toProjectId: 'p2', taskId: 't1' }] },
		])
	})

	it('halves a window of completed tasks until each part answers under the limit, each task once', async () => {
		const since = new Date('2026-01-01T00:00:00Z')
		const until = new Date('2026-01-03T00:00:00Z')
		const tasks = (count: number, from = 0) => Array.from({ length: count }, (_, index) => ({ id: `t${from + index}`, projectId: 'p1' }))
		const answers: Record<string, ReturnType<typeof tasks>> = {
			'2026-01-01T00:00:00+0000 2026-01-03T00:00:00+0000': tasks(200),
			'2026-01-01T00:00:00+0000 2026-01-02T00:00:00+0000': tasks(150),
			'2026-01-02T00:00:01+0000 2026-01-03T00:00:00+0000': tasks(100, 149),
		}
		const { sent, client } = server(({ body }) => {
			const { startDate, endDate } = body as { startDate: string, endDate: string }
			return Response.json(answers[`${startDate} ${endDate}`])
		})

		const completed = await client.completedTasks('p1', since, until)

		assert.deepEqual(sent.map(request => request.body), Object.keys(answers).map(window => {
			const [startDate, endDate] = window.split(' ')
			return { projectIds: ['p1'], startDate, endDate }
		}))
		assert.deepEqual(completed.map(task => task.id), tasks(249).map(task => task.id))
	})

	it('reads abandoned tasks through the filter by their start, as the other reads leave them out', async () => {
		const { sent, client } = server(() => Response.json([{ id: 'gave-up', projectId: 'p1', status: -1 }]))
		const abandoned = await client.abandonedTasks('p1', new Date('2026-01-01T00:00:00Z'), new Date('2036-01-01T00:00:00Z'))
		assert.deepEqual(sent, [{
			method: 'POST', url: 'https://api.ticktick.com/open/v1/task/filter', authorization: 'Bearer secret',
			body: { projectIds: ['p1'], status: [-1], startDate: '2026-01-01T00:00:00+0000', endDate: '2036-01-01T00:00:00+0000' },
		}])
		assert.deepEqual(abandoned.map(task => task.id), ['gave-up'])
	})

	it('refuses with TickTick\'s status and answer, never what it sent', async () => {
		const { client } = server(() => new Response('{"errorMessage":"unauthorized"}', { status: 401 }))
		const refusal = await client.projects().catch((error: unknown) => error)
		assert.ok(refusal instanceof TickTickRequestError)
		assert.equal(refusal.status, 401)
		assert.match(refusal.message, /unauthorized/)
		assert.doesNotMatch(refusal.message, /secret/)
	})
})
