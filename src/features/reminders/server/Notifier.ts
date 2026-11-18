import type { User } from '#features/identity'
import type { ReminderNotification } from '../ReminderNotification.js'
import { push, type Push } from './Push.js'
import { discord, type Discord } from './Discord.js'

/** Delivers a notification to the user's devices and to the Discord webhook, where one is set. */
export class Notifier {
	constructor(private readonly push: Push, private readonly discord: Discord) { }

	async send(user: User, notification: ReminderNotification) {
		await Promise.all([this.push.send(user, notification), this.discord.send(user, notification)])
	}
}

export const notifier = new Notifier(push, discord)
