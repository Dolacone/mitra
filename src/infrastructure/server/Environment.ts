type Variables = Readonly<Record<string, string | undefined>>

/**
 * What the operator set (`docs/configuration.md`), read, defaulted and checked once as the server starts ({@link environment}).
 * Never on the wire, as it holds secrets: what the browser learns of it is the `Instance` the server builds from it. A test
 * builds its own from the variables it names.
 */
export class Environment {
	/** Where the server listens (`MITRA_PORT`). */
	readonly port: number
	/** The operator's name for the instance (`MITRA_NAME`); without one the browser names it in the viewer's language. */
	readonly name?: string
	/** Local development (`MITRA_DEV`). */
	readonly developer: boolean
	/** Whether agents may connect over MCP (`MITRA_MCP`). */
	readonly mcp: boolean
	/** The instance's public address (`MITRA_URL`), where one is set and reads as a URL. */
	readonly url?: URL
	/** Where places are looked up (`MITRA_PHOTON_URL`). */
	readonly photon: URL
	/** Who push services may contact about this instance (`MITRA_VAPID_SUBJECT`). */
	readonly vapidSubject: string
	/** The Discord webhook every notification is also posted to (`MITRA_DISCORD_WEBHOOK_URL`), where one is set and reads as a URL. */
	readonly discordWebhook?: URL
	/** The largest file in bytes (`MITRA_FILE_MAX_SIZE`) and each account's total (`MITRA_FILE_QUOTA`), where set. */
	readonly files: { readonly maxSize?: number, readonly quota?: number }
	/** Sign-in through OpenID Connect (`MITRA_OIDC_*`). */
	readonly oidc?: { readonly issuer: string, readonly clientId: string, readonly clientSecret?: string, readonly scope: string }

	constructor(variables: Variables) {
		this.port = Number(variables.MITRA_PORT) || 3000
		this.name = variables.MITRA_NAME || undefined
		this.developer = variables.MITRA_DEV === 'true'
		this.mcp = !Environment.off(variables.MITRA_MCP)
		this.url = Environment.urlOf(variables.MITRA_URL)
		this.photon = new URL(variables.MITRA_PHOTON_URL || 'https://photon.komoot.io')
		this.vapidSubject = variables.MITRA_VAPID_SUBJECT || 'mailto:mitra@localhost'
		this.discordWebhook = Environment.urlOf(variables.MITRA_DISCORD_WEBHOOK_URL)
		this.files = { maxSize: Environment.bytesOf(variables.MITRA_FILE_MAX_SIZE), quota: Environment.bytesOf(variables.MITRA_FILE_QUOTA) }
		this.oidc = this.oidcOf(variables)
	}

	/** Whether people sign in. */
	get signedIn() {
		return !!this.oidc
	}

	/** A byte count, or one with a `k`/`M`/`G` suffix, as the docs advertise. */
	static bytesOf(value: string | undefined): number | undefined {
		const match = /^(\d+(?:\.\d+)?)\s*([kmg])?b?$/i.exec(value?.trim() ?? '')
		if (!match) {
			return undefined
		}
		const scale = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[match[2]?.toLowerCase() ?? ''] ?? 1
		return Math.round(Number(match[1]) * scale)
	}

	/** Whether a switch that is on by default says `off`, `false`, `0` or `no`. */
	private static off(value: string | undefined) {
		return ['off', 'false', '0', 'no'].includes(value?.trim().toLowerCase() ?? '')
	}

	private static urlOf(value: string | undefined) {
		try {
			return value?.trim() ? new URL(value.trim()) : undefined
		} catch {
			return undefined
		}
	}

	private oidcOf(variables: Variables) {
		const issuer = variables.MITRA_OIDC_ISSUER
		if (!issuer) {
			return undefined
		}
		const clientId = variables.MITRA_OIDC_CLIENT_ID
		if (!clientId) {
			throw new Error('MITRA_OIDC_ISSUER is set but MITRA_OIDC_CLIENT_ID is missing')
		}
		if (!this.url) {
			throw new Error('MITRA_OIDC_ISSUER is set but MITRA_URL (the app\'s external URL, e.g. https://mitra.example.com) is missing or no URL')
		}
		return { issuer, clientId, clientSecret: variables.MITRA_OIDC_CLIENT_SECRET || undefined, scope: variables.MITRA_OIDC_SCOPES || 'openid profile email' }
	}
}

/** This process's. */
export const environment = new Environment(process.env)
