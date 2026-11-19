import { description, label } from '@a11d/metadata'
import { Integration, integrationClassFor } from '#integrations'
import { updates } from '#infrastructure/realtime/Updates.js'
import { http, operation, Operation, type OperationContext } from '#infrastructure/operations/Operation.js'
import { importer } from './Importer.js'

@operation()
@label('Connect an integration')
@description('Connects an account with the calendars chosen, and imports their entries in the background.')
@http({ method: 'POST', path: '/integrations', status: 201, body: 'integration' })
@updates('sources')
export class ConnectIntegration extends Operation<{ readonly integration: Integration }, Integration> {
	async run({ em, user }: OperationContext): Promise<Integration> {
		const incoming = this.parameters.integration
		const integration: Integration = new (integrationClassFor(incoming.type))({ userId: user.id })
		em.persist(integration)
		await integration.apply(em, incoming)
		// A fresh context, so its calendars are loaded as they now stand.
		const saved = await em.fork().findOneOrFail(Integration, { id: integration.id })
		const enabled = saved.sources.filter(source => source.enabled).length
		this.logger.info(`Connected ${integration.type} integration with ${enabled} source(s) enabled`)
		void importer.start(em, user.id, integration.id)
		return saved
	}
}
