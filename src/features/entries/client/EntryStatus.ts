import { Component, component, html, css, property, event, query } from '@a11d/lit'
import type { Slider, Menu } from '#design'
import { type Entry } from '../Entry.js'
import { type Checklist } from '../Checklist.js'
import { EntryStatus } from '../EntryStatus.js'
import { EntryStore } from './EntryStore.js'

/**
 * The status control of an entry: a task's checkbox, ticked by a click, with its statuses and progress in a menu; an
 * event's glyph, whose click opens the menu of its statuses, since there is nothing to tick.
 */
@component('mitra-entry-status')
export class EntryStatusComponent extends Component {
	@property({ type: Object }) entry!: Entry

	/** Fired after the entry's status or progress is mutated in place, so the host can persist and re-render. */
	@event() readonly change!: EventDispatcher

	readonly store = new EntryStore(this, { entry: () => this.entry })

	protected override createRenderRoot() { return this }

	private get task() {
		return this.entry?.type.isTask ?? false
	}

	/** The status shown: an event with none is on, a task with none to do, and a task in progress reads as Doing where its calendar has it. */
	private get status() {
		const status = this.entry.effectiveStatus
		if (!this.task || status.closed) {
			return status
		}
		// Progress reads as Doing only where a task can be Doing; a calendar of two states shows it To Do.
		if (this.entry.partlyDone && this.entry.statuses.includes(EntryStatus.Doing)) {
			return EntryStatus.Doing
		}
		return status
	}

	private get progress() {
		return !this.task ? undefined : this.status === EntryStatus.Done ? 1 : this.entry.effectiveProgress
	}

	private get progressLabel() {
		if (!this.task) {
			return undefined
		}
		const { checklist } = this.entry
		if (checklist.total) {
			return EntryStatusComponent.summarize(checklist)
		}
		const progress = this.progress
		return progress === undefined ? undefined : t('${percent} complete', { percent: Math.round(progress * 100).formatAsPercent() })
	}

	private static summarize({ done, total }: Checklist) {
		return t('${done:number} of ${total:pluralityNumber} checklist items done', { done, total })
	}

	@query('mitra-menu') private readonly menu?: Menu

	/** Sets the status; an event's Confirmed is its none, as an event without STATUS takes place, so nothing is written for it. */
	private commit(status: EntryStatus) {
		const value = !this.task && status === EntryStatus.Confirmed ? undefined : status
		if (this.entry.status === value) {
			this.menu?.hide()
			return
		}
		this.entry.status = value
		this.menu?.hide()
		this.requestUpdate()
		this.change.dispatch()
	}

	private readonly clearPercent = (e: Event) => {
		e.stopPropagation()
		this.entry.progress = undefined
		this.requestUpdate()
		this.change.dispatch()
	}

	private readonly handleSliderInput = (e: Event) => {
		e.stopPropagation()
		this.entry.progress = (e.target as Slider).value / 100
		this.requestUpdate()
		this.change.dispatch()
	}

	private readonly onToggle = (e: MouseEvent) => {
		e.stopPropagation()
		e.preventDefault()
		if (e.altKey || !this.task) {
			this.menu?.toggle(e.currentTarget as HTMLElement)
			return
		}
		this.commit(this.entry.done ? EntryStatus.ToDo : EntryStatus.Done)
	}

	private readonly onContextMenu = (e: MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		this.menu?.toggle(e.currentTarget as HTMLElement)
	}

	private readonly pick = (status: EntryStatus) => (e: Event) => {
		e.stopPropagation()
		this.commit(status)
	}

	static override get styles() {
		return css`
			@keyframes dial-orbit {
				from {
					stroke-dashoffset: 0;
				}
				to {
					stroke-dashoffset: -100;
				}
			}

			mitra-entry-status {
				display: inline-flex;
				flex-shrink: 0;
				position: relative;

				> button.status-button {
					all: unset;
					display: inline-flex;
					align-items: center;
					justify-content: center;
					inline-size: 100%;
					block-size: 100%;
					cursor: pointer;
					color: inherit;
					box-sizing: border-box;

					svg, mitra-icon {
						inline-size: 100%;
						block-size: 100%;
						display: flex;
						align-items: center;
						justify-content: center;
						font-size: inherit;
					}

					svg {
						.progress-track {
							opacity: 0.6;
						}

						.progress-stroke {
							stroke-dashoffset: 0;
						}
					}
				}

				&[data-status='doing'] > button.status-button svg .progress-stroke {
					animation: dial-orbit 11s linear infinite;

					@media (prefers-reduced-motion: reduce) {
						animation: none;
					}
				}

				> mitra-menu {
					min-inline-size: 11.5rem;

					.progress-section {
						margin-block-start: 0.375rem;
						padding-block-start: 0.375rem;
						border-block-start: 1px solid color-mix(in srgb, var(--color-text) 10%, transparent);
						display: flex;
						flex-direction: column;
						gap: 0.375rem;
						padding-inline: 0.375rem;

						.progress-header {
							display: flex;
							align-items: center;
							justify-content: space-between;
							font-size: 0.75rem;
							color: var(--color-text-muted);
							min-block-size: 1.25rem;

							.value-group {
								display: flex;
								align-items: center;
								gap: 0.25rem;
								min-block-size: 1.25rem;

								.clear {
									color: var(--color-text-muted);
									margin-block: -0.25rem;
								}
							}

							.value {
								font-variant-numeric: tabular-nums;
								font-weight: 600;
								color: var(--color-text);

								&.none {
									font-weight: 400;
									color: var(--color-text-muted);
								}
							}
						}

						mitra-slider {
							margin-block-end: -0.25rem;
						}

						&.checklist {
							mitra-progress {
								margin-block: 0.125rem;
							}

							.progress-summary {
								display: flex;
								align-items: center;
								gap: 0.375rem;
								padding-block-start: 0.125rem;
								font-size: 0.75rem;
								color: var(--color-text-muted);

								mitra-icon {
									font-size: 0.8125rem;
								}
							}
						}
					}
				}

			}
		`
	}

	private get progressSectionTemplate() {
		if (!this.task) {
			return html.nothing
		}
		const { checklist } = this.entry
		if (checklist.total) {
			// RFC 5545 §3.8.1.8: a completed task reads 100%.
			const value = Math.round((this.progress ?? checklist.progress!) * 100)
			return html`
				<div class="progress-section checklist">
					<div class="progress-header">
						<span>${t('Progress')}</span>
						<span class="value">${value.formatAsPercent()}</span>
					</div>
					<mitra-progress .value=${value / 100}></mitra-progress>
					<div class="progress-summary">
						<mitra-icon icon="chart-pie"></mitra-icon>
						<span>${EntryStatusComponent.summarize(checklist)}</span>
					</div>
				</div>
			`
		}

		if (!this.entry.holds('percentComplete')) {
			return html.nothing
		}

		const progress = this.progress
		const value = progress === undefined ? 0 : Math.round(progress * 100)
		return html`
			<div class="progress-section custom">
				<div class="progress-header">
					<span>${t('Progress')}</span>
					${progress === undefined ? html`
						<span class="value none">${t('None')}</span>
					` : html`
						<div class="value-group">
							<span class="value">${value.formatAsPercent()}</span>
							<mitra-icon-button size="small" class="clear" icon="x" label=${t('Clear custom progress')} @click=${this.clearPercent}></mitra-icon-button>
						</div>
					`}
				</div>
				<mitra-slider label=${t('Progress')} step="5" .value=${value}
					@input=${this.handleSliderInput}
					@click=${(e: Event) => e.stopPropagation()}
				></mitra-slider>
			</div>
		`
	}

	protected override get template() {
		if (!this.entry?.statuses.length) {
			return html.nothing
		}

		this.setAttribute('data-status', this.status.code)

		const readout = this.progressLabel
		const name = readout ? `${this.status.format()} (${readout})` : this.status.format()
		const progress = this.progress
		const showsProgressDial = this.status === EntryStatus.Doing || (this.entry.partlyDone && !this.status.closed)
		const percent = progress !== undefined ? Math.round(progress * 100) : 50
		const hint = this.task ? t('${status}. Click to toggle, Alt-click for options', { status: name }) : t('${status}. Click for options', { status: name })
		const title = this.entry.editable ? hint : name

		return html`
			<button class="status-button" aria-label=${name} ?disabled=${!this.entry.editable}
				title=${title}
				@click=${this.onToggle}
				@contextmenu=${this.onContextMenu}>
				${showsProgressDial ? html`
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect class="progress-track" x="3" y="3" width="18" height="18" rx="2"/>
						<rect class="progress-stroke" x="3" y="3" width="18" height="18" rx="2"
							pathLength="100"
							stroke-dasharray="${percent} ${100 - percent}"
							transform="rotate(-90 12 12)"/>
						<line x1="8" y1="12" x2="16" y2="12" stroke-width="2"/>
					</svg>
				` : html`
					<mitra-icon icon=${this.status.iconFor(this.entry.type)}></mitra-icon>
				`}
			</button>
			<mitra-menu>
				${this.entry.statuses.map(status => html`
					<mitra-menu-item type="radio" icon=${status.iconFor(this.entry.type)} ?selected=${status === this.status} @click=${this.pick(status)}>${status.format()}</mitra-menu-item>
				`)}
				${this.progressSectionTemplate}
			</mitra-menu>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'mitra-entry-status': EntryStatusComponent
	}
}
