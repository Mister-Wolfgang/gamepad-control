// Protocole texte du helper PowerShell, une ligne par message :
//   READY
//   DEVICE <xbox|sony|nintendo|unknown> <nom>
//   PAD <index> <up|down>
//   DOWN <nom>      un bouton vient d'être pressé
//   UP <nom>        un bouton vient d'être relâché
//   ERROR <message>

export type PadKind = 'xbox' | 'sony' | 'nintendo' | 'unknown'

export type PadEvent =
  | { type: 'ready' }
  | { type: 'device'; kind: PadKind; name: string }
  | { type: 'pad'; index: number; isUp: boolean }
  | { type: 'down'; name: string }
  | { type: 'up'; name: string }
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
    case 'DOWN':
      return rest ? { type: 'down', name: rest } : undefined
    case 'UP':
      return rest ? { type: 'up', name: rest } : undefined
    case 'ERROR':
      return { type: 'error', message: rest }
    default:
      return undefined
  }
}

// Lit la réponse du modèle : une suggestion par ligne commençant par « - », quatre au plus (une par bouton ABXY)
export function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(line => line !== '')
    .slice(0, 4)
}

// Découpe un flux de morceaux en lignes complètes ; le reste attend le morceau suivant
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts, rest }
}
