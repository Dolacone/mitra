import { converter } from '@a11d/converter'
import type { EntityManager } from '@mikro-orm/core'
import { User } from '#features/identity'
import { TimeZone } from '#features/time/TimeZone.js'
import { model, entity, primaryKey, property, manyToOne, unique, withheld, instant } from '#infrastructure/model'
import { type DeviceFacts } from './DeviceFacts.js'

type PushKeys = { p256dh: string, auth: string }

@model('NotificationSubscription')
@entity()
@unique({ properties: ['endpoint'] })
export class NotificationSubscription {
	/**
	 * The subscription at `endpoint`, whoever's it is: a browser signed in to by another user registers the same endpoint,
	 * which then becomes theirs (`register`).
	 */
	static at(em: EntityManager, endpoint: string) {
		return em.findOne(NotificationSubscription, { endpoint })
	}

	@primaryKey({ type: 'string' }) id!: string
	@manyToOne(() => User, { mapToPk: true, deleteRule: 'cascade' }) userId!: string
	@property({ type: 'string' }) endpoint!: string

	/** The delivery secret, never sent to a client. */
	@property({ type: 'json' })
	@converter(withheld<PushKeys>('p256dh', 'auth')) keys!: PushKeys

	@property({ type: 'string', nullable: true }) name?: string

	/** The device's zone, which floating reminders resolve in. */
	@converter(TimeZone.converter)
	@property({ type: TimeZone.Mapper, nullable: true }) timeZone?: TimeZone

	@property({ type: 'string', nullable: true }) platform?: string
	@property({ type: 'string', nullable: true }) browser?: string
	@property({ type: 'boolean', nullable: true }) mobile?: boolean

	@converter(instant)
	@property({ type: 'Date', nullable: true }) lastSeenAt?: Date

	constructor(init?: Partial<NotificationSubscription>) {
		Object.assign(this, init)
	}

	/** What a device reports, as it is kept: trimmed, at most `max` characters, none when blank. */
	private static textOf(value: string | undefined, max: number) {
		return value?.trim().slice(0, max) || undefined
	}

	/**
	 * Restamps what the device reports on every registration, leaving the user's `name` alone. A browser signed in to by
	 * another user becomes theirs, as its endpoint is unique, but the name the previous user gave it does not.
	 */
	register(userId: string, registration: DeviceFacts & { keys: PushKeys, timeZone?: string }) {
		if (this.userId && this.userId !== userId) {
			this.name = undefined
		}
		this.userId = userId
		this.keys = registration.keys
		this.timeZone = TimeZone.parse(registration.timeZone)
		this.platform = NotificationSubscription.textOf(registration.platform, 64)
		this.browser = NotificationSubscription.textOf(registration.browser, 64)
		this.mobile = registration.mobile
		this.lastSeenAt = new Date()
	}

	/** Takes over from the subscription the browser rotated away from: the user's name belongs to the device, not the endpoint. */
	succeed(previous: NotificationSubscription) {
		this.name ??= previous.name
	}

	/** An empty name falls back to what the browser reports. */
	rename(name: string | undefined) {
		this.name = NotificationSubscription.textOf(name, 60)
	}
}
