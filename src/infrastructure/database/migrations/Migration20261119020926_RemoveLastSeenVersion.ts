import { Migration } from '@mikro-orm/migrations'

export class Migration20261119020926_RemoveLastSeenVersion extends Migration {
	override up() {
		this.addSql('alter table `user` drop column `last_seen_version`;')
	}

	override down() {
		this.addSql('alter table `user` add column `last_seen_version` text null;')
	}
}
