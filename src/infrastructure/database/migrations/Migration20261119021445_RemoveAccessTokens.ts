import { Migration } from '@mikro-orm/migrations'

export class Migration20261119021445_RemoveAccessTokens extends Migration {
	override up() {
		this.addSql('drop table if exists `access_token`;')
	}

	override down() {
		this.addSql('create table `access_token` (`created_at` datetime not null, `hash` text not null, `id` text not null primary key, `last_used_at` datetime null, `name` text not null, `scope` text check (`scope` in (\'read\', \'write\')) not null, `user_id` text not null, constraint `access_token_user_id_foreign` foreign key (`user_id`) references `user` (`id`) on delete cascade);')
		this.addSql('create unique index `access_token_hash_unique` on `access_token` (`hash`);')
		this.addSql('create index `access_token_user_id_index` on `access_token` (`user_id`);')
	}
}
