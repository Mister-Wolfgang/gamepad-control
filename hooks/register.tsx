import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PadStatus } from '../types'
import { encodedCommand, HELPER_SCRIPT } from './helper'
import { parseLine, splitLines, type PadEvent, type PadKind } from './parse'

const PANE = 'gamepad-control'

const status = atom({ plugin: 'gamepad-control', key: 'status' } as const, {
  kind: 'unknown',
  devices: [],
  connected: false,
  last: '',
  error: '',
} as PadStatus)

// Touches XInput -> action de session
const ACTIONS: Record<string, 'send' | 'interrupt' | 'continue' | 'clear'> = {
  A: 'send',
  B: 'interrupt',
  X: 'continue',
  Y: 'clear',
}

const LABELS: Record<string, string> = {
  send: 'envoyer le brouillon',
  interrupt: 'interrompre le tour',
  continue: 'envoyer « Continue. »',
  clear: 'vider le brouillon',
}

const KIND_LABELS: Record<PadKind, string> = {
  xbox: 'Xbox (XInput)',
  sony: 'PlayStation (boutons lus via XInput, par Steam Input ou DS4Windows)',
  nintendo: 'Nintendo (boutons lus via XInput, par Steam Input)',
  unknown: 'inconnue',
}

// Identifiant du tour en cours, pour que B puisse l'interrompre
let turnId: string | undefined

async function runAction($: EngineInterface, action: 'send' | 'interrupt' | 'continue' | 'clear') {
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
      <Box flexDirection="column">
        <Text bold>Manette : {KIND_LABELS[s.kind]}</Text>
        <Text>{s.connected ? 'Connectée' : 'Aucune manette active'}</Text>
        <Text dimColor>Dernière touche : {s.last || '—'}</Text>
        {s.devices.map((name, i) => (
          <Text key={i} dimColor>Détectée : {name}</Text>
        ))}
        {s.error !== '' && <Text>{s.error}</Text>}
        <Text bold>Touches</Text>
        <Text>A  {LABELS.send}</Text>
        <Text>B  {LABELS.interrupt}</Text>
        <Text>X  {LABELS.continue}</Text>
        <Text>Y  {LABELS.clear}</Text>
        <Box flexDirection="row">
          <Button onPress={() => runAction($, 'send')}>A envoyer</Button>
          <Button onPress={() => runAction($, 'interrupt')}>B interrompre</Button>
          <Button onPress={() => runAction($, 'continue')}>X continuer</Button>
          <Button onPress={() => runAction($, 'clear')}>Y vider</Button>
        </Box>
      </Box>
    )
  })
}
