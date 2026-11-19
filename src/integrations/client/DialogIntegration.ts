import { component, html, css, state, bind, unsafeHTML, ifDefined, live } from '@a11d/lit'
import { DialogComponent } from '@a11d/lit-application'
import { CreateSource, ConnectIntegration, UpdateIntegration } from '#operations'
import '#design/TextField.js'
import { pressable } from '#design'
import { docsPage } from '#infrastructure/http/website.js'
import { Calendars } from '#features/sources/client/Calendars.js'
import { integrationClasses, type Integration, type IntegrationClass } from '#integrations'
import mitraLogo from '#integrations/mitra/logo.svg'

const logos: Record<string, string> = {
	mitra: mitraLogo,
}

@component('mitra-dialog-integration')
export class DialogIntegration extends DialogComponent<{ readonly id?: string }, Integration> {
	@state() private entity?: Integration
	/** The first calendar's name, for integrations that don't discover sources. */
	@state() calendarName = ''

	protected override createRenderRoot() { return this }

	private get isEdit() { return !!this.parameters.id }

	private get discoversSources() { return this.integrationClass?.discoversSources !== false }

	private get integrationClass(): IntegrationClass | undefined {
		return integrationClasses().find(integrationClass => integrationClass.type === this.entity?.type)
	}

	/** What can still be added: an integration one per account only until it is connected. */
	static get offeredClasses(): Array<IntegrationClass> {
		const connected = new Set(Calendars.integrations.map(integration => integration.type))
		return integrationClasses().filter(integrationClass =>
			!(integrationClass.onePerUser && connected.has(integrationClass.type)))
	}

	private selectType(integrationClass: IntegrationClass) {
		this.entity = new integrationClass({ sources: [] })
		this.calendarName = ''
	}

	protected override connected() {
		if (!this.isEdit) {
			return
		}
		const integration = Calendars.integrations.find(integration => integration.id === this.parameters.id)
		if (integration) {
			// A clone holds nothing the listed one holds, so editing here changes nothing listed.
			this.entity = integration.clone()
		}
	}

	static override get styles() {
		return css`
			mitra-dialog-integration {
				&:has(.types) {
					--mitra-dialog-width: min(36rem, 92vw);
				}

				.types {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
					gap: 0.625rem;

					.type {
						${pressable};
						display: flex;
						flex-direction: column;
						border: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
						border-radius: var(--border-radius);
						transition: border-color 0.15s ease;
						align-items: flex-start;
						justify-content: flex-start;
						gap: 0.125rem;
						padding: 0.875rem;
						text-align: start;
						background: transparent;
						user-select: none;

						&:not(:disabled):hover {
							border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
						}

						.logo {
							display: inline-flex;
							font-size: 1.75rem;
							margin-block-end: 0.625rem;

							svg {
								width: 1em;
								height: 1em;
							}
						}

						.name {
							font-size: 0.875rem;
							font-weight: 600;
						}

						.description {
							font-size: 0.75rem;
							font-weight: 400;
							color: var(--color-text-muted);
						}
					}
				}

				.content {
					display: flex;
					flex-direction: column;
					gap: 1rem;

					.connect {
						align-self: flex-start;
					}

					.hint {
						margin: 0;
						font-size: 0.8125rem;
						color: var(--color-text-muted);
					}

					.error {
						margin: 0;
						font-size: 0.8125rem;
						color: var(--color-error);
					}
				}

				> mitra-dialog > .guide {
					margin-inline-end: auto;
					font-size: 0.8125rem;
				}

				.sources {
					display: flex;
					flex-direction: column;
					gap: 0.75rem;

					.sources-title {
						font-size: 0.75rem;
						font-weight: 600;
						color: var(--color-text-muted);
					}

					.source {
						font-size: 0.875rem;
						color: var(--color-text);

						&::part(label) {
							gap: 0.625rem;
						}

						mitra-source-icon {
							font-size: 16px;
						}

						.name {
							display: flex;
							align-items: baseline;
							gap: 0.5rem;
							min-width: 0;

							.types {
								font-size: 0.75rem;
								color: var(--color-text-muted);
							}
						}
					}
				}
			}
		`
	}

	private get saveDisabled() {
		return (this.discoversSources || this.isEdit) && !this.entity?.sources.length
	}

	protected override get template() {
		return html`
			<mitra-dialog
				heading=${this.isEdit ? t('Edit integration') : (this.integrationClass ? t(this.integrationClass.label) : t('Add integration'))}
				primaryButtonText=${!this.entity ? html.nothing : t('Save')}
				?primaryButtonDisabled=${this.saveDisabled}
				?primaryOnEnter=${!!this.entity && !this.discoversSources && !this.isEdit}
			>
				${this.isEdit || !this.entity ? html.nothing : html`
					<mitra-icon-button slot="leading" icon="arrow-left" label=${t('Back')}
						@click=${() => this.entity = undefined}
					></mitra-icon-button>
				`}
				${!this.entity ? this.typesTemplate : this.detailsTemplate}
				${!this.entity || !this.guide ? html.nothing : html`
					<mitra-link slot="footer" class="guide" icon="arrow-up-right" href=${this.guide}>${t('Guide')}</mitra-link>
				`}
			</mitra-dialog>
		`
	}

	private get typesTemplate() {
		return html`
			<div class="types">
				${DialogIntegration.offeredClasses.map(integrationClass => html`
					<button class="type" @click=${() => this.selectType(integrationClass)}>
						<span class="logo">${unsafeHTML(logos[integrationClass.logo] ?? '')}</span>
						<span class="name">${t(integrationClass.label)}</span>
						<span class="description">${t(integrationClass.description)}</span>
					</button>
				`)}
			</div>
		`
	}

	private get detailsTemplate() {
		const entity = this.entity!
		return html`
			<form class="content" @submit=${(e: Event) => e.preventDefault()}>
				${this.descriptionTemplate}
				${this.panelTemplate}

				${!entity.sources.length ? html.nothing : html`
					<div class="sources">
						<span class="sources-title">${t('Sources')}</span>
						${entity.sources.map(source => html`
							<mitra-checkbox class="source" .checked=${live(source.enabled)} @change=${() => { source.toggleEnabled(); this.requestUpdate() }}>
								<mitra-source-icon .source=${source} icon=${ifDefined(entity.sourceIcon)}></mitra-source-icon>
								<span class="name">
									${source.name}
									<span class="types">${[
										// Availability fits every calendar, so only what the provider stores is listed.
										...source.supportedEntryTypes.filter(type => !type.isAvailability).map(type => type.formatPlural()),
										...source.readOnly ? [t('read-only')] : [],
									].join(' · ')}</span>
								</span>
							</mitra-checkbox>
						`)}
					</div>
				`}
			</form>
		`
	}

	/** What the integration is, above everything the dialog asks of it. */
	private get descriptionTemplate() {
		switch (this.entity!.type) {
			case 'mitra': return html`<p class="hint">${t('Mitra.Hint')}</p>`
			default: return html.nothing
		}
	}

	private get panelTemplate() {
		switch (this.entity!.type) {
			case 'mitra': return this.mitraTemplate
			default: return html.nothing
		}
	}

	private get guide() {
		const docs = this.integrationClass?.docs
		return docs ? docsPage(docs) : undefined
	}

	private get mitraTemplate() {
		return this.isEdit ? html.nothing : html`
			<mitra-text-field label=${t('Calendar name')} placeholder=${t('Calendar')} ${bind(this, 'calendarName', { event: 'input' })}></mitra-text-field>
		`
	}

	protected override async primaryAction() {
		// Nothing was discovered, so create the first calendar through the regular source endpoint.
		if (!this.discoversSources && !this.isEdit) {
			const integration = await ConnectIntegration.call({ integration: this.entity! })
			await CreateSource.call({ id: integration.id, name: this.calendarName.trim() || String(t('Calendar')) })
			await Calendars.fetch()
			return integration
		}
		const integration = this.isEdit ? await UpdateIntegration.call({ id: this.entity!.id, integration: this.entity! }) : await ConnectIntegration.call({ integration: this.entity! })
		await Calendars.fetch()
		return integration
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'mitra-dialog-integration': DialogIntegration
	}
}
