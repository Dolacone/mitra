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
