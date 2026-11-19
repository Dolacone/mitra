/**
 * OS launch integration. The PWA manifest (scripts/indexHtml.ts) registers mitra as a handler for
 * the webcal: protocol; with `launch_handler: focus-existing`, a launch reaches the
 * already-running window as LaunchParams on `window.launchQueue` instead of navigating it. A cold
 * start instead navigates to the handler URL, whose `?subscribe=` parameter is consumed at boot, so
 * a cold protocol launch surfaces on BOTH paths, which {@link observeLaunches} deduplicates.
 */

interface LaunchParams {
	readonly targetURL?: string
}

interface LaunchQueue {
	setConsumer(consumer: (params: LaunchParams) => void): void
}

export interface LaunchHandlers {
	subscribe(url: string): void
}

/** Extracts the subscription address a protocol launch encoded into the handler URL. */
export function subscribeUrlOf(target: string): string | undefined {
	try {
		return new URL(target).searchParams.get('subscribe')?.trim() || undefined
	} catch {
		return undefined
	}
}

let bootConsumedUrl: string | undefined

/** Reads the protocol-launch parameter of a cold start, before the page canonicalizes its URL.
 * Deliberately does not strip it: `PageCalendar` is the sole URL writer, and its first canonical
 * write drops the parameter along with everything else it does not own. */
export function consumeSubscribeParameter(): string | undefined {
	return bootConsumedUrl = subscribeUrlOf(location.href)
}

/** Consumes queued and future launches (focus-existing warm launches). */
export function observeLaunches(handlers: LaunchHandlers) {
	(window as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(params => {
		const url = !params.targetURL ? undefined : subscribeUrlOf(params.targetURL)
		if (url && url !== bootConsumedUrl) {
			handlers.subscribe(url)
		}
		bootConsumedUrl = undefined
	})
}

/** Claims every file dropped onto the window, as the browser would otherwise navigate away from the app to show it. */
export function claimFileDrops() {
	window.addEventListener('dragover', event => {
		if ([...event.dataTransfer?.items ?? []].some(item => item.kind === 'file')) {
			event.preventDefault()
		}
	})
	window.addEventListener('drop', event => {
		if ([...event.dataTransfer?.files ?? []].length) {
			event.preventDefault()
		}
	})
}
