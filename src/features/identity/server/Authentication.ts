import type { EntityManager } from '@mikro-orm/sqlite'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { createLogger } from '#infrastructure/logging/Logger.js'
import { User } from '../User.js'

declare global {
	namespace Express {
		interface Request {
			/** The signed-in user, attached by {@link Authentication.middleware} before any route runs. */
			user: User
		}
	}
}

const logger = createLogger('Auth')

/** How the instance signs a request in: as the one local account. */
export abstract class Authentication {
	static async of(em: EntityManager) {
		const authentication: Authentication = new LocalAccount(await User.local(em))
		logger.info(authentication.description)
		return authentication
	}

	/** What the instance runs as, logged as the server starts. */
	protected abstract readonly description: string

	readonly middleware: RequestHandler = (req, res, next) => this.authenticate(req, res, next)

	protected abstract authenticate(req: Request, res: Response, next: NextFunction): unknown
}

/** Single-user mode: every request is the one local account's. */
class LocalAccount extends Authentication {
	protected readonly description = 'Single-user mode: no authentication'

	constructor(private readonly user: User) {
		super()
	}

	protected authenticate(req: Request, _res: Response, next: NextFunction) {
		req.user = this.user
		next()
	}
}
