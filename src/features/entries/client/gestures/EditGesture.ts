import { type Entry } from '../../Entry.js'
import { DialogEntryScope } from '../DialogEntryScope.js'
import { EntryStore } from '../EntryStore.js'
import { DragGesture, type DragMode, type DragStart } from './DragGesture.js'

/** Changes where an entry lies, moving or resizing it, and commits what the drop leaves once its scope is known. */
export abstract class EditGesture extends DragGesture {
	/** As it was when the gesture began. */
	protected readonly before: Entry

	constructor(start: DragStart, mode: DragMode, readonly entry: Entry) {
		super(start, mode)
		this.before = entry.clone()
	}

	override held() {
		EntryStore.pending.setDragging(this.entry)
	}

	override started() {
		EntryStore.pending.setDragging(this.entry)
	}

	/** What the scope dialog is asked about the drop. */
	protected abstract get intent(): 'move' | 'edit'

	/** A tap, which never moved: the entry stays put. */
	protected tapped() { }

	/** What the drop does with `built`: places the entry there and answers how far its start moved, or keeps it where it was. */
	protected dropOn(built: Entry, _e: PointerEvent): number | undefined {
		const { entry } = this
		const delta = built.start && entry.start ? built.start.valueOf() - entry.start.valueOf() : 0
		entry.adopt(built.span)
		EntryStore.notify()
		return delta
	}

	override drop(e: PointerEvent) {
		EntryStore.pending.setPreview(undefined)
		EntryStore.pending.setDragging(undefined)
		if (!this.moved) {
			this.tapped()
			return
		}
		const built = this.build(this.point)
		const { entry, before } = this
		// Nowhere to put it: take the entry back rather than keep the last frame's placement.
		if (!built) {
			entry.adopt(before.span)
			EntryStore.notify()
			return
		}
		const delta = this.dropOn(built, e)
		if (delta === undefined) {
			return
		}
		const bypass = e.ctrlKey || e.metaKey || entry.editsOnlyThisOccurrence(before)
		void DialogEntryScope.resolve(entry, this.intent, bypass).then(scope => {
			if (!scope) {
				return EntryStore.revert(entry)
			}
			return EntryStore.commit(entry, scope.recurrence)
				.catch(() => EntryStore.revert(entry))
		})
	}

	override cancel() {
		EntryStore.pending.setPreview(undefined)
		EntryStore.pending.setDragging(undefined)
	}
}
