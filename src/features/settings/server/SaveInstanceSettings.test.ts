import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { OperationServer } from '#infrastructure/operations/OperationServer.testing.js'
import { GetMeta } from './GetMeta.js'
import { SaveInstanceSettings } from './SaveInstanceSettings.js'

describe('SaveInstanceSettings', () => {
	let server: OperationServer
	before(async () => server = await OperationServer.start())
	after(() => server.close())

	const administering = (administers: boolean) => server.query('update `user` set `role` = ? where `id` = ?', [administers ? 'administrator' : 'member', server.user.id])

	it('refuses a member, keeping what holds for everyone', async () => {
		await administering(false)
		await assert.rejects(() => SaveInstanceSettings.call({ settings: {} }))
		assert.equal((await GetMeta.call()).settings, undefined)
	})

	it('keeps only what a setting knows for an administrator', async () => {
		await administering(true)
		assert.deepEqual({ ...await SaveInstanceSettings.call({ settings: { unknown: 'dropped' } }) }, {})
	})
})
