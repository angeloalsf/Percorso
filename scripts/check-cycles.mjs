import { spawnSync } from 'node:child_process'

// These Finance store cycles predate the Calendar module. Keep them visible,
// but fail CI only if a new cycle is introduced.
const existingCycles = new Set([
  'features/finance/store/store.ts > features/finance/store/cards.ts',
  'features/finance/store/store.ts > features/finance/store/cards.ts > features/finance/store/bills.ts',
  'features/finance/store/store.ts > features/finance/store/cards.ts > features/finance/store/bills.ts > features/finance/store/transactions.ts'
])

const result = spawnSync('madge', ['--circular', '--json', '--extensions', 'ts,tsx', 'src'], {
  encoding: 'utf8'
})

if (result.error || (result.status !== 0 && result.status !== 1)) {
  console.error(result.error ?? result.stderr)
  process.exit(1)
}

let cycles
try {
  cycles = JSON.parse(result.stdout)
  if (!Array.isArray(cycles) || !cycles.every((cycle) => Array.isArray(cycle))) throw new Error('Invalid Madge output')
} catch (error) {
  console.error('Could not read Madge cycle results:', error)
  process.exit(1)
}

const unexpected = cycles.map((cycle) => cycle.join(' > ')).filter((cycle) => !existingCycles.has(cycle))
console.log(`${cycles.length} circular dependencies (${cycles.length - unexpected.length} previously documented).`)
if (unexpected.length > 0) {
  console.error('New circular dependencies:\n' + unexpected.join('\n'))
  process.exit(1)
}
