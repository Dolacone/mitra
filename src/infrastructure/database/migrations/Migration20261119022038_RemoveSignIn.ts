import { Migration } from '@mikro-orm/migrations'

export class Migration20261119022038_RemoveSignIn extends Migration {
	override up() {
		this.addSql('drop table if exists `session`;')

		this.addSql('drop index `user_oidc_issuer_oidc_subject_unique`;')
		this.addSql('alter table `user` drop column `oidc_email`;')
		this.addSql('alter table `user` drop column `oidc_issuer`;')
		this.addSql('alter table `user` drop column `oidc_name`;')
		this.addSql('alter table `user` drop column `oidc_picture`;')
		this.addSql('alter table `user` drop column `oidc_subject`;')
		this.addSql('alter table `user` drop column `role`;')
	}

	override down() {
		this.addSql('create table `session` (`expires_at` datetime not null, `id` text not null primary key, `id_token` text null, `user_id` text not null, constraint `session_user_id_foreign` foreign key (`user_id`) references `user` (`id`) on delete cascade);')
		this.addSql('create index `session_user_id_index` on `session` (`user_id`);')

		this.addSql('alter table `user` add column `oidc_email` text null;')
		this.addSql('alter table `user` add column `oidc_issuer` text null;')
		this.addSql('alter table `user` add column `oidc_name` text null;')
		this.addSql('alter table `user` add column `oidc_picture` text null;')
		this.addSql('alter table `user` add column `oidc_subject` text null;')
		this.addSql('alter table `user` add column `role` text not null default \'member\';')
		this.addSql('create unique index `user_oidc_issuer_oidc_subject_unique` on `user` (`oidc_issuer`, `oidc_subject`);')
	}
}
