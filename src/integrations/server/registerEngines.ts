import { registerEngine } from '#integrations'
import { CalDAVSyncEngine } from '#integrations/caldav/server/CalDAVSyncEngine.js'

const caldav = new CalDAVSyncEngine()
registerEngine('caldav', caldav)
registerEngine('google', caldav)
