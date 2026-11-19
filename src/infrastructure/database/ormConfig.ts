import { UnderscoreNamingStrategy, defineConfig } from '@mikro-orm/sqlite'
import { Migrator } from '@mikro-orm/migrations'
import { User } from '#features/identity'
import { Source } from '#features/sources'
import { Entry, EntryFile } from '#features/entries'
import { NotificationSubscription } from '#features/reminders/NotificationSubscription.js'
import { File } from '#features/files/File.js'
import { Routine } from '#features/routines/Routine.js'
import { RoutineSubscriber } from '#features/routines/server/RoutineSubscriber.js'
import { Integration } from '#integrations'
import { MitraCalendar, TickTick } from '#integrations/registerIntegrations.js'
import { children } from '#infrastructure/model'
import { State } from './State.js'
import { migrations, nameOf } from './migrations/index.js'

/** ORM configuration shared between runtime (orm.ts) and migration CLI. */
export function ormConfig(dbName: string) {
	return defineConfig({
		entities: [User, Integration, MitraCalendar, TickTick, Source, Entry, NotificationSubscription, File, EntryFile, Routine, State],
		subscribers: [children.subscriber, RoutineSubscriber],
		dbName,
		extensions: [Migrator],
		migrations: {
			migrationsList: migrations.map(migration => ({ name: nameOf(migration), class: migration })),
			snapshot: false,
		},
		namingStrategy: class extends UnderscoreNamingStrategy {
			override joinColumnName(propertyName: string) {
				return this.propertyToColumnName(propertyName)
			}

			override joinKeyColumnName(entityName: string) {
				return this.propertyToColumnName(entityName)
			}
		},
		allowGlobalContext: true,
		// The domain holds no null: an empty column loads as an absent field, which saves as NULL again.
		forceUndefined: true,
	})
}
