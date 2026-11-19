import { description, label } from '@a11d/metadata'
import type { Source } from '#features/sources'
import { Integration, integrationClassFor } from '#integrations'
import { http, operation, Operation, type OperationContext } from '#infrastructure/operations/Operation.js'

@operation()
@label('Discover calendars')
@description('Signs in to an account with the credentials given and lists the calendars it holds, without connecting it.')
@http({ method: 'POST', path: '/integrations/sources', body: 'integration' })
export class DiscoverSources extends Operation<{ readonly integration: Integration }, Array<Source>> {
	async run({ em, user }: OperationContext): Promise<Array<Source>> {
		const incoming = this.parameters.integration
		const integration: Integration = await em.findOne(Integration, { id: incoming.id, userId: user.id })
			?? new (integrationClassFor(incoming.type))({ userId: user.id })
		integration.merge(incoming)
		return integration.getSources(em, { checkDuplicate: true })
	}
}
