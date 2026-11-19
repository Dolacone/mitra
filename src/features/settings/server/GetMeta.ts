import { description, label } from '@a11d/metadata'
import { FileLimits } from '#features/files/server/FileLimits.js'
import { environment } from '#infrastructure/server/Environment.js'
import { http, operation, Operation } from '#infrastructure/operations/Operation.js'
import { Instance } from '../Instance.js'

@operation()
@label('Read the instance')
@description('Answers what this instance is: its name, version, mode, whether agents may connect, and file limits.')
@http({ method: 'GET', path: '/meta' })
export class GetMeta extends Operation<object, Instance> {
	run() {
		// Only an operator's name travels: without one the browser names the instance itself, in the viewer's language.
		return Promise.resolve(new Instance({
			name: environment.name,
			version: mitra.version,
			commit: mitra.commit,
			node: process.version,
			files: FileLimits.of(environment),
			mcp: environment.mcp,
		}))
	}
}
