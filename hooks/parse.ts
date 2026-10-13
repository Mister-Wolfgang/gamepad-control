// Protocole texte du helper PowerShell, une ligne par message :
//   READY
//   DEVICE <xbox|sony|nintendo|unknown> <nom>
//   PAD <index> <up|down>
//   BTN <nom>
//   ERROR <message>

export type PadKind = 'xbox' | 'sony' | 'nintendo' | 'unknown'

export type PadEvent =
  | { type: 'ready' }
  | { type: 'device'; kind: PadKind; name: string }
  | { type: 'pad'; index: number; isUp: boolean }
  | { type: 'button'; name: string }
  | { type: 'error'; message: string }

const KINDS: readonly string[] = ['xbox', 'sony', 'nintendo']

function toKind(word: string): PadKind {
  return KINDS.includes(word) ? (word as PadKind) : 'unknown'
}

// Une ligne inconnue ou mal formée donne undefined : le helper peut évoluer sans casser le mod
export function parseLine(line: string): PadEvent | undefined {
  const text = line.trim()
  const space = text.indexOf(' ')
  const word = space === -1 ? text : text.slice(0, space)
  const rest = space === -1 ? '' : text.slice(space + 1)

  switch (word) {
    case 'READY':
      return { type: 'ready' }
    case 'DEVICE': {
      const [kind = '', ...name] = rest.split(' ')
      return { type: 'device', kind: toKind(kind), name: name.join(' ') }
    }
    case 'PAD': {
      const [index = '', state = ''] = rest.split(' ')
      const position = Number(index)
      if (!Number.isInteger(position) || (state !== 'up' && state !== 'down')) return undefined
      return { type: 'pad', index: position, isUp: state === 'up' }
    }
    case 'BTN':
      return rest ? { type: 'button', name: rest } : undefined
    case 'ERROR':
      return { type: 'error', message: rest }
    default:
      return undefined
  }
}

// Découpe un flux de morceaux en lignes complètes ; le reste attend le morceau suivant
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts, rest }
}
