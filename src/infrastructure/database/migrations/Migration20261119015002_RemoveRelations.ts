import { Migration } from '@mikro-orm/migrations'

export class Migration20261119015002_RemoveRelations extends Migration {
	override up() {
		this.addSql('drop table if exists `entry_relation`;')
	}

	override down() {
		this.addSql('create table `entry_relation` (`entry_id` text not null, `gap` text null, `id` text not null primary key, `target_uid` text not null, `type` text not null, constraint `entry_relation_entry_id_foreign` foreign key (`entry_id`) references `entry` (`id`) on delete cascade);')
		this.addSql('create index `entry_relation_entry_id_index` on `entry_relation` (`entry_id`);')
		this.addSql('create index `entry_relation_target_uid_index` on `entry_relation` (`target_uid`);')
	}
}
