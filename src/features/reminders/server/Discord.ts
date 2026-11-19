import type { User } from '#features/identity'
import { TimeZone } from '#features/time/TimeZone.js'
import { createLogger } from '#infrastructure/logging/Logger.js'
import { orm } from '#infrastructure/database/orm.js'
import { environment, type Environment } from '#infrastructure/server/Environment.js'
import type { ReminderNotification, Reader } from '../ReminderNotification.js'

const logger = createLogger('Discord')

/** Discord's limit on a message's text. */
const maximumLength = 2000

/**
 * Posts every notification, whoever it is for, to the one webhook the operator set (`MITRA_DISCORD_WEBHOOK_URL`), read in
 * the zone of the user's last seen device, else in their home zone.
 */
export class Discord {
	constructor(private readonly environment: Environment) { }

	get enabled() {
		return !!this.environment.discordWebhook
	}

	/** The webhook's body: the notification as `reader` reads it, linking to the entry where the instance has an address, and pinging no one. */
	message(notification: ReminderNotification, reader: Reader, now: number) {
		const { title, body, url } = notification.for(reader, now)
		const link = this.environment.url && new URL(url, this.environment.url).href
		return {
			content: [`**${title}**`, body, link].filter(Boolean).join('\n').slice(0, maximumLength),
			allowed_mentions: { parse: [] },
		}
	}

	async send(user: User, notification: ReminderNotification) {
		const webhook = this.environment.discordWebhook
		if (!webhook) {
			return
		}
		const [device] = await user.getDevices(orm.em.fork())
		const reader: Reader = { timeZone: device?.timeZone ?? user.timeZones?.home?.zone ?? TimeZone.default }
		try {
			const response = await fetch(webhook, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(this.message(notification, reader, Date.now())),
				signal: AbortSignal.timeout(10_000),
			})
			if (!response.ok) {
				logger.warn(`Discord did not take "${notification.facts.heading}" for user ${user.id}: HTTP ${response.status}`)
			}
		} catch (error) {
			logger.warn(`Discord delivery failed for user ${user.id}:`, error instanceof Error ? error.message : error)
		}
	}
}

export const discord = new Discord(environment)
