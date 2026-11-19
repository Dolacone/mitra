import { Localizer, LocalizableString } from '@3mo/localization'
import en from './en.json' with { type: 'json' }

Localizer.dictionaries.add({ en })

/** `t()` for the server, which has no current locale. */
export function localize(key: string, parameters: Record<string, string | number> = {}) {
	return LocalizableString.get(key).localize('en', parameters).value
}
