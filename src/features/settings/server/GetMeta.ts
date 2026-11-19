import { description, label } from '@a11d/metadata'
import { FileLimits } from '#features/files/server/FileLimits.js'
import { State } from '#infrastructure/database/State.js'
import { environment } from '#infrastructure/server/Environment.js'
import { http, operation, Operation, type OperationContext } from '#infrastructure/operations/Operation.js'
import { Instance } from '../Instance.js'
import { InstanceSettings } from '../InstanceSettings.js'

@operation()
@label('Read the instance')
@description('Answers what this instance is: its name, version, mode, whether people sign in and agents may connect, file limits, and what its administrators set for everyone.')
@http({ method: 'GET', path: '/meta' })
export class GetMeta extends Operation<object, Instance> {
	async run({ em }: OperationContext) {
		// Only an operator's name travels: without one the browser names the instance itself, in the viewer's language.
		return new Instance({
			name: environment.name,
			version: mitra.version,
			commit: mitra.commit,
			node: process.version,
			development: environment.developer,
			files: FileLimits.of(environment),
			signIn: environment.signedIn,
			mcp: environment.mcp,
			settings: await State.read<InstanceSettings>(em, InstanceSettings.key),
		})
	}
}
