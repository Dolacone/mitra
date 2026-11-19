import { registerEngine } from '#integrations'
import { TickTickSyncEngine } from '#integrations/ticktick/server/TickTickSyncEngine.js'

registerEngine('ticktick', new TickTickSyncEngine())
