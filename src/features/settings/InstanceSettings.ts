/**
 * What holds for everyone on the instance, which its administrators set: kept in `State` under {@link InstanceSettings.key},
 * only what deviates from the defaults, and read by the browser with the rest of what the instance says of itself.
 */
export class InstanceSettings {
	static readonly key = 'instance-settings'

	/** Drops unknown keys and values out of range, and answers nothing when nothing is left. */
	static sanitize(_input: unknown): InstanceSettings | undefined {
		return undefined
	}
}
