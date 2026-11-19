/**
 * Install prompt suppression and Window Controls Overlay theme synchronization.
 */

window.addEventListener('beforeinstallprompt', event => event.preventDefault())

/** Synchronize `<meta name="theme-color">` with live `--color-background` for Window Controls Overlay. */
export function syncThemeColor(): void {
	const meta = document.querySelector('meta[name="theme-color"]')
	if (!meta) {
		return
	}
	const apply = () => {
		const probe = document.createElement('div')
		probe.style.cssText = 'display: none; background-color: var(--color-background)'
		document.documentElement.appendChild(probe)
		meta.setAttribute('content', getComputedStyle(probe).backgroundColor)
		probe.remove()
	}
	apply()
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
}
