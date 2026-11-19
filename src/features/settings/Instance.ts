import { model } from '#infrastructure/model'

/** What an instance says of itself (`GetMeta`), which the browser reads once it loads. */
@model('Instance')
export class Instance {
	/** The operator's `MITRA_NAME`, if any. */
	name?: string
	version!: string
	commit!: string
	node?: string
	/** The largest file in bytes (0 takes no uploads), and each account's total. */
	files?: { readonly maxSize: number, readonly quota?: number }
	/** Whether agents may connect over MCP (`MITRA_MCP`). */
	mcp?: boolean

	constructor(init?: Partial<Instance>) {
		Object.assign(this, init)
	}

	/** The operator's name, else Mitra's own in the current language. */
	get displayName() {
		return this.name ?? String(t('Mitra'))
	}
}
