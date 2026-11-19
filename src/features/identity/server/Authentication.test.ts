import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import express from 'express'
import type { MikroORM } from '@mikro-orm/sqlite'
import { User } from '../User.js'
import type { Authentication as AuthenticationType } from './Authentication.js'

describe('Authentication', () => {
	let orm: MikroORM
	let Authentication: typeof AuthenticationType
	before(async () => {
		// After the test file has loaded: the database opens on import.
		({ orm } = await import('#infrastructure/database/orm.js'))
		;({ Authentication } = await import('./Authentication.js'))
	})
	after(() => orm.close())

	/** The server as `server.ts` mounts it, a request answering whose it is. */
	const serve = async (authentication: AuthenticationType) => {
		const app = express()
		app.use(authentication.middleware)
		app.all('/{*path}', (req, res) => res.json({ user: req.user?.id ?? null }))
		const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
			const listening = app.listen(0, () => resolve(listening))
		})
		const origin = `http://localhost:${(server.address() as AddressInfo).port}`
		after(() => server.close())
		return (path: string) => fetch(`${origin}${path}`, { redirect: 'manual' })
	}

	const userOf = async (response: Response) => (await response.json() as { user: string | null }).user

	it('signs every request in as the one local account', async () => {
		const request = await serve(await Authentication.of(orm.em.fork()))
		const local = await orm.em.fork().findOneOrFail(User, { username: User.default.username })
		assert.equal(await userOf(await request('/api/entries')), local.id)
	})
})
