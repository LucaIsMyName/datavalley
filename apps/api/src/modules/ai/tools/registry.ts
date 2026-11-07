import { AppError } from '../../../errors.js'
import { describeTableTool } from './describe-table.js'
import { highlightTool } from './highlight.js'
import { navigateTool } from './navigate.js'
import { listProjectsTool } from './list-projects.js'
import { listTablesTool } from './list-tables.js'
import { proposeChangesTool } from './propose-changes.js'
import { proposeFormulaTool } from './propose-formula.js'
import { sampleRowsTool } from './sample-rows.js'
import { searchTool } from './search.js'
import { asRecord, emptyEffects, type AiTool, type ToolHost } from './types.js'

export { emptyEffects }

export const aiTools: AiTool[] = [
  listProjectsTool,
  listTablesTool,
  describeTableTool,
  searchTool,
  sampleRowsTool,
  highlightTool,
  navigateTool,
  proposeChangesTool,
  proposeFormulaTool,
]

const byName = new Map(aiTools.map((tool) => [tool.name, tool]))

export function toolDefinitions() {
  return aiTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
}

export async function runTool(host: ToolHost, name: string, args: unknown) {
  const tool = byName.get(name)
  if (!tool) return { error: 'Unknown tool' }
  try {
    return await tool.run(host, asRecord(args))
  } catch (error) {
    if (error instanceof AppError) return { error: error.message }
    return { error: 'Tool failed' }
  }
}
