import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PadStatus } from '../types'
import { encodedCommand, HELPER_SCRIPT } from './helper'
import { parseLine, parseSuggestions, splitLines, type PadEvent, type PadKind } from './parse'

const PANE = 'gamepad-control'

const status = atom({ plugin: 'gamepad-control', key: 'status' } as const, {
  kind: 'unknown',
  devices: [],
  connected: false,
  last: '',
  error: '',
  suggestions: [],
  queue: [],
} as PadStatus)

type Action = 'send' | 'interrupt' | 'continue' | 'clear' | 'suggest' | 'accept' | 'runNext'

// Touches XInput -> action de session
const ACTIONS: Record<string, Action> = {
  A: 'send',
  B: 'interrupt',
  X: 'continue',
  Y: 'clear',
  Start: 'suggest',
  Back: 'runNext',
}

// Couleurs des boutons Xbox, pour les repérer d'un coup d'œil
const PAD_COLORS = { A: 'green', B: 'red', X: 'blue', Y: 'yellow' } as const

const KIND_LABELS: Record<PadKind, string> = {
  xbox: 'Xbox (XInput)',
  sony: 'PlayStation (boutons lus via XInput : Steam Input ou DS4Windows)',
  nintendo: 'Nintendo (boutons lus via XInput : Steam Input)',
  unknown: 'marque inconnue',
}

// Demande au modèle, dans la session en cours, trois actions possibles pour la suite
const SUGGEST_PROMPT =
  'En t’appuyant sur cette session, propose jusqu’à trois actions courtes et concrètes que ' +
  'l’utilisateur pourrait demander ensuite. Réponds uniquement par une liste : une action par ligne, ' +
  'chaque ligne commençant par « - ».'

// Pourquoi $.model.fork ne répond pas, dit en clair dans le panneau
const FORK_REASONS: Record<string, string> = {
  'nothing-to-fork': 'Rien à suggérer encore : envoie d’abord un prompt, puis appuie sur Start.',
  'api-error': 'Suggestions indisponibles : erreur de l’API.',
  'empty-reply': 'Suggestions indisponibles : réponse vide.',
  aborted: 'Suggestions annulées.',
}

// Identifiant du tour en cours, pour que B puisse l'interrompre
let turnId: string | undefined

async function runAction($: EngineInterface, action: Action, index = 0) {
  if (action === 'send') {
    const { text } = await $.prompt.read()
    if (text.trim() === '') return
    await $.prompt.submit({ text })
    await $.prompt.fill({ text: '', mode: 'replace' })
    return
  }
  if (action === 'interrupt') {
    if (turnId) await $.turn.abort({ turnId })
    return
  }
  if (action === 'continue') {
    await $.prompt.submit({ text: 'Continue.' })
    return
  }
  if (action === 'suggest') {
    const reply = await $.model.fork({ prompt: SUGGEST_PROMPT })
    if (!reply.isAnswered) {
      await update($, status, s => ({ ...s, error: FORK_REASONS[reply.reason] ?? 'Suggestions indisponibles.' }))
      return
    }
    const suggestions = parseSuggestions(reply.text)
    await update($, status, s => ({ ...s, suggestions, error: '' }))
    return
  }
  if (action === 'accept') {
    const s = await read($, status)
    const item = s.suggestions[index]
    if (item === undefined) return
    await update($, status, st => ({ ...st, queue: [...st.queue, item] }))
    return
  }
  if (action === 'runNext') {
    const s = await read($, status)
    const [next, ...rest] = s.queue
    if (next === undefined) return
    await update($, status, st => ({ ...st, queue: rest }))
    await $.prompt.submit({ text: next })
    return
  }
  await $.prompt.fill({ text: '', mode: 'replace' })
}

async function handle($: EngineInterface, event: PadEvent) {
  if (event.type === 'device') {
    await update($, status, s => ({
      ...s,
      kind: s.kind === 'unknown' ? event.kind : s.kind,
      devices: [...s.devices, event.name],
    }))
    return
  }
  if (event.type === 'pad') {
    await update($, status, s => ({ ...s, connected: event.isUp }))
    $.ui.toast(event.isUp ? 'Manette connectée' : 'Manette déconnectée')
    return
  }
  if (event.type === 'button') {
    await update($, status, s => ({ ...s, last: event.name }))
    const action = ACTIONS[event.name]
    if (action) await runAction($, action)
    return
  }
  if (event.type === 'error') {
    await update($, status, s => ({ ...s, error: event.message }))
  }
}

// Le helper tourne tant que le mod est chargé : son flux est lu en tâche de fond
function startHelper($: EngineInterface) {
  void (async () => {
    try {
      const helper = $.process.spawn({
        argv: ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand(HELPER_SCRIPT)],
      })
      let pending = ''
      for await (const { stream, text } of helper) {
        if (stream === 'stderr') {
          await update($, status, s => ({ ...s, error: text.trim() }))
          continue
        }
        const split = splitLines(pending + text)
        pending = split.rest
        for (const line of split.lines) {
          const event = parseLine(line)
          if (event) await handle($, event)
        }
      }
      await update($, status, s => ({ ...s, connected: false, error: 'helper arrêté' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await update($, status, s => ({ ...s, error: 'helper indisponible : ' + message }))
    }
  })()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gamepad',
      description: 'Ouvre le panneau de contrôle à la manette',
    })
    void $.ui.open({ id: PANE, title: 'Manette' })
    startHelper($)

    return next(e)
  })

  on('command.run', { command: 'gamepad' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Manette' })

    return { text: 'Panneau manette ouvert.' }
  })

  on('turn.start', ($, e, next) => {
    turnId = e.turnId
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    turnId = undefined
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, status)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold color="cyan">◆ Manette</Text>
            <Text color={s.connected ? 'green' : 'gray'}>{s.connected ? '● connectée' : '○ aucune'}</Text>
          </Box>
          <Text dimColor>{KIND_LABELS[s.kind]}</Text>
          <Box flexDirection="row" gap={2}>
            {(['A', 'B', 'X', 'Y'] as const).map(key => (
              <Text key={key} bold color={PAD_COLORS[key]}>({key})</Text>
            ))}
            <Text dimColor>{s.last ? 'dernier : ' + s.last : ''}</Text>
          </Box>
          {s.devices.map((name, i) => (
            <Text key={i} dimColor>{name}</Text>
          ))}
          {s.error !== '' && <Text color="red">{s.error}</Text>}
        </Box>

        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={2}>
            <Button variant="primary" onPress={() => runAction($, 'send')}>▶ Envoyer (A)</Button>
            <Button onPress={() => runAction($, 'interrupt')}>■ Interrompre (B)</Button>
          </Box>
          <Box flexDirection="row" gap={2}>
            <Button onPress={() => runAction($, 'continue')}>↻ Continuer (X)</Button>
            <Button onPress={() => runAction($, 'clear')}>✕ Vider (Y)</Button>
          </Box>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text bold color="magenta">✦ Suggestions</Text>
          {s.suggestions.length === 0 && <Text dimColor>Aucune pour l’instant.</Text>}
          {s.suggestions.map((item, i) => (
            <Box key={i} flexDirection="row" justifyContent="space-between" gap={2}>
              <Text>▸ {item}</Text>
              <Button onPress={() => runAction($, 'accept', i)}>+ File</Button>
            </Box>
          ))}
          <Box flexDirection="row" gap={2}>
            <Button onPress={() => runAction($, 'suggest')}>✦ Suggérer (Start)</Button>
            <Button onPress={() => runAction($, 'runNext')}>➜ Suivant (Back)</Button>
          </Box>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>File ({s.queue.length})</Text>
          {s.queue.length === 0 && <Text dimColor>Vide.</Text>}
          {s.queue.map((item, i) => (
            <Text key={i}>{i + 1}. {item}</Text>
          ))}
        </Box>
      </Box>
    )
  })
}
