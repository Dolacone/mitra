import { model } from '#infrastructure/model'
import type { InstanceSettings } from './InstanceSettings.js'

/** What an instance says of itself (`GetMeta`), which the browser reads once it loads. */
@model('Instance')
export class Instance {
	/** The operator's `MITRA_NAME`, if any. */
	name?: string
	version!: string
	commit!: string
	node?: string
	development?: boolean
	/** The largest file in bytes (0 takes no uploads), and each account's total. */
	files?: { readonly maxSize: number, readonly quota?: number }
	/** Whether people sign in. */
	signIn?: boolean
	/** Whether agents may connect over MCP (`MITRA_MCP`). */
	mcp?: boolean
	/** What its administrators set for everyone on it. */
	settings?: InstanceSettings

	constructor(init?: Partial<Instance>) {
		Object.assign(this, init)
	}

	/** The operator's name, else Mitra's own in the current language. */
	get displayName() {
		return this.name ?? String(t('Mitra'))
	}
}
