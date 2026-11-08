export const CHAT_OPEN_KEY = 'datavalley.ai.open'

export const AI_RAIL_WIDTH = '2.5rem'
export const AI_PANEL_WIDTH = '24rem'

export function readAiChatOpen(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(CHAT_OPEN_KEY) === 'open'
}

export function writeAiChatOpen(open: boolean, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(CHAT_OPEN_KEY, open ? 'open' : 'closed')
}
