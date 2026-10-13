import { expect, test } from 'claude-code/testing'

import { ICONS } from './icons'
import { parseLine, parseSuggestions, splitLines } from './parse'

test('chaque icône a une case par colonne et ligne, codée sur 12 octets', () => {
  for (const icon of Object.values(ICONS)) {
    expect(atob(icon.cells).length).toBe(icon.columns * icon.rows * 12)
  }
})

test('DOWN et UP donnent le nom du bouton et son sens', () => {
  expect(parseLine('DOWN A')).toEqual({ type: 'down', name: 'A' })
  expect(parseLine('UP LThumb')).toEqual({ type: 'up', name: 'LThumb' })
})

test('PAD donne l index et l etat', () => {
  expect(parseLine('PAD 0 down')).toEqual({ type: 'pad', index: 0, isUp: false })
  expect(parseLine('PAD 2 up')).toEqual({ type: 'pad', index: 2, isUp: true })
})

test('DEVICE donne la marque et le nom complet, espaces compris', () => {
  expect(parseLine('DEVICE sony Wireless Controller')).toEqual({
    type: 'device',
    kind: 'sony',
    name: 'Wireless Controller',
  })
})

test('une marque inconnue devient unknown', () => {
  expect(parseLine('DEVICE acme Pad 3000')).toEqual({ type: 'device', kind: 'unknown', name: 'Pad 3000' })
})

test('READY et ERROR', () => {
  expect(parseLine('READY')).toEqual({ type: 'ready' })
  expect(parseLine('ERROR xinput absent')).toEqual({ type: 'error', message: 'xinput absent' })
})

test('une ligne inconnue ou mal formee est ignoree', () => {
  expect(parseLine('')).toBeUndefined()
  expect(parseLine('DOWN')).toBeUndefined()
  expect(parseLine('BTN A')).toBeUndefined()
  expect(parseLine('PAD x down')).toBeUndefined()
  expect(parseLine('PAD 0 peut-etre')).toBeUndefined()
  expect(parseLine('AUTRE chose')).toBeUndefined()
})

test('splitLines garde le morceau incomplet pour le suivant', () => {
  expect(splitLines('DOWN A\nUP A\nDO')).toEqual({ lines: ['DOWN A', 'UP A'], rest: 'DO' })
  expect(splitLines('WN X\n')).toEqual({ lines: ['WN X'], rest: '' })
})

test('parseSuggestions garde les lignes à puce, quatre au plus', () => {
  const reply = 'Voici :\n- relire le diff\n- lancer les tests\n\n- écrire le README\n- une quatrième\n- une cinquième\n'
  expect(parseSuggestions(reply)).toEqual(['relire le diff', 'lancer les tests', 'écrire le README', 'une quatrième'])
})

test('parseSuggestions ignore le texte sans puce', () => {
  expect(parseSuggestions('Rien à proposer.')).toEqual([])
  expect(parseSuggestions('- \n-  \n')).toEqual([])
})
