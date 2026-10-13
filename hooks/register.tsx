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
} as PadStatus)

type Action =
  | 'sendSuggestion' // envoie la suggestion n tout de suite
  | 'send'           // envoie le brouillon
  | 'interrupt'
  | 'suggest'        // demande quatre suggestions à la session
  | 'continue'       // envoie « Continue. »
  | 'clearDraft'

// Boutons XInput : ABXY pour les suggestions, LB en modificateur (interrompre), RB pour « Continue. »
const SLOTS = ['A', 'B', 'X', 'Y'] as const
const MODIFIERS = ['LB', 'RB'] as const

// Couleurs des boutons Xbox, pour les repérer d'un coup d'œil
const PAD_COLORS = { A: 'green', B: 'red', X: 'blue', Y: 'yellow' } as const

const KIND_LABELS: Record<PadKind, string> = {
  xbox: 'Xbox (XInput)',
  sony: 'PlayStation (boutons lus via XInput : Steam Input ou DS4Windows)',
  nintendo: 'Nintendo (boutons lus via XInput : Steam Input)',
  unknown: 'marque inconnue',
}

// Demande au modèle, dans la session en cours, quatre actions possibles pour la suite
const SUGGEST_PROMPT =
  'En t’appuyant sur cette session, propose jusqu’à quatre actions courtes et concrètes que ' +
  'l’utilisateur pourrait demander ensuite. Réponds uniquement par une liste : une action par ligne, ' +
  'chaque ligne commençant par « - ».'

// Pourquoi $.model.fork ne répond pas, dit en clair dans le panneau
const FORK_REASONS: Record<string, string> = {
  'nothing-to-fork': 'Rien à suggérer encore : envoie d’abord un prompt, puis appuie sur Back.',
  'api-error': 'Suggestions indisponibles : erreur de l’API.',
  'empty-reply': 'Suggestions indisponibles : réponse vide.',
  aborted: 'Suggestions annulées.',
}

// Identifiant du tour en cours, pour que LB+Start puisse l'interrompre
let turnId: string | undefined
// Modificateurs tenus, et modificateurs ayant déjà servi à une combinaison
const held = new Set<string>()
const combined = new Set<string>()

async function runAction($: EngineInterface, action: Action, index = 0) {
  if (action === 'sendSuggestion') {
    const s = await read($, status)
    const item = s.suggestions[index]
    if (item === undefined) return
    await $.prompt.submit({ text: item })
    return
  }
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
  if (action === 'continue') {
    await $.prompt.submit({ text: 'Continue.' })
    return
  }
  await $.prompt.fill({ text: '', mode: 'replace' })
}

// Action d'un bouton pressé seul (sans modificateur)
function plainDown(name: string): { action: Action; index?: number } | undefined {
  const slot = SLOTS.indexOf(name as (typeof SLOTS)[number])
  if (slot !== -1) return { action: 'sendSuggestion', index: slot }
  if (name === 'Start') return { action: 'send' }
  if (name === 'Back') return { action: 'suggest' }
  return undefined
}

// Action d'un bouton pressé pendant qu'un modificateur est tenu
function comboDown(modifier: string, name: string): { action: Action } | undefined {
  if (modifier === 'LB' && name === 'Start') return { action: 'interrupt' }
  return undefined
}

async function onDown($: EngineInterface, name: string) {
  held.add(name)
  if ((MODIFIERS as readonly string[]).includes(name)) return

  const modifier = MODIFIERS.find(m => held.has(m))
  if (modifier) {
    const combo = comboDown(modifier, name)
    if (combo) {
      combined.add(modifier)
      await runAction($, combo.action)
      return
    }
  }
  const plain = plainDown(name)
  if (plain) await runAction($, plain.action, plain.index)
}

async function onUp($: EngineInterface, name: string) {
  held.delete(name)
  if (!(MODIFIERS as readonly string[]).includes(name)) return
  // Un modificateur relâché seul fait son action propre ; après une combinaison, rien
  if (combined.has(name)) {
    combined.delete(name)
    return
  }
  await runAction($, name === 'LB' ? 'clearDraft' : 'continue')
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
    if (!event.isUp) {
      held.clear()
      combined.clear()
    }
    await update($, status, s => ({ ...s, connected: event.isUp }))
    $.ui.toast(event.isUp ? 'Manette connectée' : 'Manette déconnectée')
    return
  }
  if (event.type === 'down') {
    await update($, status, s => ({ ...s, last: event.name }))
    await onDown($, event.name)
    return
  }
  if (event.type === 'up') {
    await onUp($, event.name)
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
        argv: ['powershell', '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text', '-EncodedCommand', encodedCommand(HELPER_SCRIPT)],
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
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, status)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="cyan">◆ Manette</Text>
          <Text color={s.connected ? 'green' : 'gray'}>{s.connected ? '● connectée' : '○ aucune'}</Text>
        </Box>
        <Text dimColor>{KIND_LABELS[s.kind]}{s.last ? ' · dernier : ' + s.last : ''}</Text>
        {s.error !== '' && <Text color="red">{s.error}</Text>}

        <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text bold color="magenta">✦ Suggestions</Text>
          {SLOTS.map((key, i) => {
            const item = s.suggestions[i]
            return (
              <Box key={key} flexDirection="row" gap={1}>
                <Text bold inverse color={PAD_COLORS[key]}> {key} </Text>
                <Box flexGrow={1}>
                  <Text dimColor={item === undefined}>{item ?? '—'}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box flexDirection="column">
          <Text dimColor>ABXY envoyer la suggestion · Back suggérer · Start envoyer le brouillon</Text>
          <Text dimColor>LB+Start interrompre · RB « Continue. » · LB seul vider le brouillon</Text>
        </Box>
      </Box>
    )
  })
}
