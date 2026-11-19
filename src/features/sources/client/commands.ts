import { Command } from '#features/commands/Command.js'
import { type Source } from '../Source.js'
import { Calendars } from './Calendars.js'

class ShowOnlySource extends Command {
	constructor(private readonly source: Source) {
		super()
	}

	get heading() { return t('Only Show ${name}', { name: this.source.name }) }
	readonly icon = 'scan-eye'
	readonly keywords = t('ShowOnlySource.Keywords')
	readonly keys = []
	readonly group = undefined

	override get listedWithoutQuery() { return false }

	override async execute() {
		await Calendars.solo(this.source.id)
		this.calendar.sourcesChanged()
	}
}

class ShowPreviouslyVisibleSources extends Command {
	readonly heading = t('Show Previously Visible Calendars')
	readonly icon = 'eye'
	readonly keywords = t('ShowPreviouslyVisibleSources.Keywords')
	readonly keys = []
	readonly group = undefined

	override async execute() {
		await Calendars.restoreVisibility()
		this.calendar.sourcesChanged()
	}
}

/** The per-calendar verbs as they stand right now. */
export function sourceCommands(): Array<Command> {
	const sources = Calendars.integrations.flatMap(integration => integration.enabledSources)
	return [
		...Calendars.canRestoreVisibility ? [new ShowPreviouslyVisibleSources()] : [],
		...sources.length < 2 ? [] : sources.map(source => new ShowOnlySource(source)),
	]
}
