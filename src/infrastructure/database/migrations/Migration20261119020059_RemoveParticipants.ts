import { Migration } from '@mikro-orm/migrations'

export class Migration20261119020059_RemoveParticipants extends Migration {
	override up() {
		this.addSql('alter table `integration` drop column `addresses`;')

		this.addSql('alter table `entry` drop column `participants`;')
	}

	override down() {
		this.addSql('alter table `entry` add column `participants` json null;')

		this.addSql('alter table `integration` add column `addresses` json null;')
	}
}
