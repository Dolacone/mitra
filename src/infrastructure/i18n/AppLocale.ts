import { Localizer } from '@3mo/localization'

/** The one locale Mitra reads in: English as written in the US, every time on a 24-hour clock. */
export class AppLocale {
	static readonly tag = 'en-US-u-hc-h23'

	/** Runs the app in {@link tag}. */
	static apply() {
		if (String(Localizer.locales.current) !== AppLocale.tag) {
			Localizer.locales.current = AppLocale.tag
		}
	}
}
