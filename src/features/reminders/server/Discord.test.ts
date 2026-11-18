import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TimeZone } from '#features/time/TimeZone.js'
import { Environment } from '#infrastructure/server/Environment.js'
import { ReminderNotification } from '../ReminderNotification.js'
import { Discord } from './Discord.js'

/** 2026-09-08 10:00 in Berlin. */
const start = Date.UTC(2026, 8, 8, 8, 0)
const hour = 60 * 60_000

const notification = (heading: string) => new ReminderNotification({
	heading,
	tag: 'entry|30',
	kind: 'event',
	timestamp: start,
	when: { start, end: start + hour },
	entry: { id: 'standup' },
})

const reader = { locale: 'en', timeZone: TimeZone.of('Europe/Berlin') }

/** Intl's thin and narrow spaces, as plain ones. */
const plain = (text: string) => text.replace(/[\u2009\u202f\u00a0]/g, ' ')

describe('Discord', () => {
	const webhook = 'https://discord.com/api/webhooks/1/token'

	it('is on only where the operator set a webhook that reads as a URL', () => {
		assert.equal(new Discord(new Environment({ MITRA_DISCORD_WEBHOOK_URL: webhook })).enabled, true)
		assert.equal(new Discord(new Environment({ MITRA_DISCORD_WEBHOOK_URL: 'not a url' })).enabled, false)
		assert.equal(new Discord(new Environment({})).enabled, false)
	})

	it('posts the reminder as its reader reads it, with a link to the entry on the instance', () => {
		const discord = new Discord(new Environment({ MITRA_DISCORD_WEBHOOK_URL: webhook, MITRA_URL: 'https://mitra.example.com' }))
		const { content } = discord.message(notification('Standup'), reader, start - 30 * 60_000)
		assert.equal(plain(content), '**Standup**\n10:00 \u2013 11:00 AM\nhttps://mitra.example.com/?date=2026-09-08&selected=standup')
	})

	it('leaves the link out where the instance has no address', () => {
		const discord = new Discord(new Environment({ MITRA_DISCORD_WEBHOOK_URL: webhook }))
		assert.equal(plain(discord.message(notification('Standup'), reader, start - 30 * 60_000).content), '**Standup**\n10:00 \u2013 11:00 AM')
	})

	it('pings no one, whatever a heading says', () => {
		const discord = new Discord(new Environment({ MITRA_DISCORD_WEBHOOK_URL: webhook }))
		assert.deepEqual(discord.message(notification('@everyone standup'), reader, start).allowed_mentions, { parse: [] })
	})
})
