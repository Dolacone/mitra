import { component, html, css, state } from '@a11d/lit'
import { DialogComponent } from '@a11d/lit-application'
import { EntryOccurrenceChangeScope } from '#features/recurrence'
import { type Entry } from '../Entry.js'
import { EntryStatus } from '../EntryStatus.js'
import { EntryStore } from './EntryStore.js'

/** Scope for edit, move, or delete across a recurring entry's dates. */
export interface EntryScope {
	readonly recurrence?: EntryOccurrenceChangeScope
	/** A deletion turned into cancelling this date alone, which a routine counts as not kept rather than forgets. */
	readonly cancel?: boolean
}

export interface EntryScopeParameters {
	readonly entry: Entry
	readonly intent: 'edit' | 'move' | 'delete'
	readonly series: boolean
	/** Whether a deletion may cancel the date instead: an entry of a routine, on a calendar that keeps Cancelled. */
	readonly cancels?: boolean
}

/**
 * Scope dialog for recurring series.
 */
@component('mitra-dialog-entry-scope')
export class DialogEntryScope extends DialogComponent<EntryScopeParameters, EntryScope | undefined> {
	private static get modifier() {
		return navigator.userAgent.includes('Mac') ? '⌘' : t('Ctrl')
	}

	/** Asks how far a gesture on `entry` reaches, unless nothing is to be asked. */
	static resolve(entry: Entry, intent: 'edit' | 'move' | 'delete', bypass = false): Promise<EntryScope | undefined> {
		const series = !!entry.recurringEntryId
		// Deleting a routine's date offers to cancel it instead.
		const cancels = intent === 'delete' && !!entry.routineId && entry.statuses.includes(EntryStatus.Cancelled) && !entry.cancelled
		if (series && intent !== 'delete' && !entry.source.capabilities.entries.occurrences) {
			return Promise.resolve({ recurrence: EntryOccurrenceChangeScope.All })
		}
		if (bypass || (!series && !cancels)) {
			return Promise.resolve({ recurrence: series ? EntryOccurrenceChangeScope.This : undefined })
		}
		return new DialogEntryScope({ entry, intent, series, cancels }).confirm()
	}

	@state() private recurrence = EntryOccurrenceChangeScope.This
	@state() private step = 0

	protected override createRenderRoot() { return this }

	protected override cancellationAction() {
		return undefined
	}

	private get questions() {
		return [
			...this.parameters.cancels && !this.parameters.series ? ['cancel' as const] : [],
			...this.parameters.series ? ['recurrence' as const] : [],
		]
	}

	private get question() { return this.questions[this.step] }

	private get entryIcon() { return this.parameters.entry.type.isTask ? 'calendar-check' : 'calendar' }

	private get heading() {
		if (this.question === 'cancel') {
			return t('Cancel or delete?')
		}
		switch (this.parameters.intent) {
			case 'delete':
				return this.parameters.series ? t('Delete repeating entry') : t('Delete entry')
			case 'move':
				return this.parameters.series ? t('Move repeating entry') : t('Move entry')
			default:
				return this.parameters.series ? t('Edit repeating entry') : t('Edit entry')
		}
	}

	private chooseRecurrence(recurrence: EntryOccurrenceChangeScope) {
		this.recurrence = recurrence
		this.answered()
	}

	private cancel() {
		this.close({ recurrence: this.parameters.series ? EntryOccurrenceChangeScope.This : undefined, cancel: true })
	}

	private get answer(): EntryScope {
		return { recurrence: this.parameters.series ? this.recurrence : undefined }
	}

	private answered() {
		if (this.step < this.questions.length - 1) {
			this.step++
		} else {
			this.close(this.answer)
		}
	}

	static override get styles() {
		return css`
			mitra-dialog-entry-scope {
				--mitra-dialog-width: min(28rem, 92vw);

				/* Beside the scopes it is no scope of its own, so it takes a row of its own under them. */
				.recurrence > .cancel {
					flex-basis: 100%;
				}

				.count {
					display: block;
					margin-block-start: 0.125rem;
					font-weight: 400;
					color: var(--color-text-muted);
				}

				.hint {
					margin: 0;
					font-size: 0.75rem;
					color: var(--color-text-muted);
					text-wrap: balance;
				}

				@media (pointer: coarse) {
					.hint {
						display: none;
					}
				}
			}
		`
	}

	protected override get template() {
		return html`
			<mitra-dialog heading=${this.heading}>
				${this.step === 0 ? html.nothing : html`
					<mitra-icon-button slot="leading" icon="arrow-left" label=${t('Back')}
						@click=${() => this.step--}
					></mitra-icon-button>
				`}
				${this.question === 'cancel' ? this.cancelChoices : this.recurrenceChoices}
				${this.step > 0 ? html.nothing : html`
					<p class="hint">${t('Tip: hold ${modifier} to skip this dialog and apply to this entry only', { modifier: DialogEntryScope.modifier })}</p>
				`}
			</mitra-dialog>
		`
	}

	/** Cancelling reaches this date alone, so it is one choice beside the deletion, never a scope of its own. */
	private get cancelChoice() {
		return !this.parameters.cancels ? html.nothing : html`
			<mitra-choice class="cancel" icon=${EntryStatus.Cancelled.iconFor(this.parameters.entry.type)} @click=${() => this.cancel()}>
				<span>${t('Mark it cancelled')}<span class="count">${t('Its routine counts it as not kept')}</span></span>
			</mitra-choice>
		`
	}

	private get cancelChoices() {
		return html`
			<mitra-choices>
				${this.cancelChoice}
				<mitra-choice autofocus icon="trash-2" @click=${() => this.answered()}>${t('Delete')}</mitra-choice>
			</mitra-choices>
		`
	}

	private get recurrenceChoices() {
		return html`
			<mitra-choices class="recurrence">
				<mitra-choice autofocus icon=${this.entryIcon} @click=${() => this.chooseRecurrence(EntryOccurrenceChangeScope.This)}>${t('This entry')}</mitra-choice>
				${EntryStore.occurrenceOf(this.parameters.entry).first ? html.nothing : html`
					<mitra-choice icon="chevrons-right" @click=${() => this.chooseRecurrence(EntryOccurrenceChangeScope.Following)}>${t('This and following entries')}</mitra-choice>
				`}
				<mitra-choice icon="repeat" @click=${() => this.chooseRecurrence(EntryOccurrenceChangeScope.All)}>${t('All entries')}</mitra-choice>
				${this.parameters.intent === 'delete' ? this.cancelChoice : html.nothing}
			</mitra-choices>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'mitra-dialog-entry-scope': DialogEntryScope
	}
}
