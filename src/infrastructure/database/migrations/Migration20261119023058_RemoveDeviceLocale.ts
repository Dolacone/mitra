import { Migration } from '@mikro-orm/migrations'

export class Migration20261119023058_RemoveDeviceLocale extends Migration {
	override up() {
		this.addSql('alter table `notification_subscription` drop column `locale`;')
	}

	override down() {
		this.addSql('alter table `notification_subscription` add column `locale` text null;')
	}
}
