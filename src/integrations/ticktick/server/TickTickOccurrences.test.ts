import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from '@3mo/date-time'
import { Entry, EntryPatch, EntryType } from '#features/entries'
import { CompleteTask } from '#features/entries/server/CompleteTask.js'
import { CreateEntry } from '#features/entries/server/CreateEntry.js'
import { DeleteEntryOccurrence } from '#features/entries/server/DeleteEntryOccurrence.js'
import { UpdateEntryOccurrence } from '#features/entries/server/UpdateEntryOccurrence.js'
import { shown, viewIn, zones } from '#features/entries/server/viewers.testing.js'
import { EntryOccurrenceChangeScope, Recurrence, RecurrenceFrequency } from '#features/recurrence'
import { registerEngine } from '#integrations'
import { OperationServer } from '#infrastructure/operations/OperationServer.testing.js'
import { TickTickAccount } from './TickTickAccount.testing.js'

/** TickTick keeps a repeating task as one task, which its completion moves on. */
describe('A repeating TickTick task', () => {
	let server: OperationServer
	const account = new TickTickAccount()
	before(async () => {
		server = await OperationServer.start()
		registerEngine('ticktick', account.engine())
		await server.query('insert into `integration` (`id`, `user_id`, `uri`, `type`, `credentials`) values (\'ticktick\', ?, \'ticktick://account\', \'ticktick\', \'{"token":"token","timeZone":"Asia/Taipei"}\')', [server.user.id])
		await server.query('insert into `source` (`id`, `integration_id`, `uri`, `entry_types`, `name`, `enabled`, `hidden`) values (\'work\', \'ticktick\', \'ticktick://project/p1\', \'["task"]\', \'Work\', 1, 0)')
		viewIn(zones.berlin)
	})
	after(() => server.close())

	const repeating = async (heading: string) => {
		const { id } = await CreateEntry.call(EntryPatch.creating(new Entry({ sourceId: 'work', type: EntryType.Task, heading, start: new DateTime('2026-12-16T08:00:00Z'), recurrence: new Recurrence({ freq: RecurrenceFrequency.Daily }) })))
		const occurrences = (await shown('2026-12-16', '2026-12-19')).filter(occurrence => occurrence.recurringEntryId === id)
		assert.equal(occurrences.length, 3)
		return { id: id!, occurrences }
	}
	const taskOf = (title: string) => [...account.tasks.values()].find(task => task.title === title)!.id
	const rows = () => server.query<{ id: string, status: string | null }>('select id, status from entry where source_id = \'work\'')

	it('changes or deletes none of its dates alone', async () => {
		const { id, occurrences: [, second] } = await repeating('Water plants')
		const edited = second!.override()
		edited.heading = 'Water the fern'

		await assert.rejects(UpdateEntryOccurrence.call({ ...EntryPatch.of(edited, EntryPatch.occurrence), id, occurrence: second!.storedRecurrenceId!, scope: EntryOccurrenceChangeScope.This }), /keeps a repeating entry's dates as one/)
		await assert.rejects(DeleteEntryOccurrence.call({ id, occurrence: second!.storedRecurrenceId!, scope: EntryOccurrenceChangeScope.Following }), /keeps a repeating entry's dates as one/)
		assert.deepEqual((await rows()).map(row => row.id), [id])
	})

	it('completes the task on its first date, for TickTick to move on, rather than leaving that date apart', async () => {
		const { id, occurrences: [first] } = await repeating('Stretch')
		account.calls.length = 0

		const completed = await CompleteTask.call({ id, occurrence: first!.storedRecurrenceId! })

		assert.deepEqual([completed.id, account.calls], [id, [`complete p1 ${taskOf('Stretch')}`]])
		assert.equal((await rows()).filter(row => row.id !== id && row.status === 'done').length, 0)
	})

	it('takes the first date ticked in the editor for the task\'s completion', async () => {
		const { id, occurrences: [first] } = await repeating('Read')
		account.calls.length = 0
		const ticked = first!.override()
		ticked.done = true

		const completed = await UpdateEntryOccurrence.call({ ...EntryPatch.of(ticked, EntryPatch.occurrence), id, occurrence: first!.storedRecurrenceId!, scope: EntryOccurrenceChangeScope.This })

		assert.deepEqual([completed.id, account.calls], [id, [`complete p1 ${taskOf('Read')}`]])
	})
})
