import { expect, test } from 'claude-code/testing'

import { parseLine, parseSuggestions, splitLines } from './parse'

test('parseSuggestions garde les lignes à puce, trois au plus', () => {
  const reply = 'Voici :\n- relire le diff\n- lancer les tests\n\n- écrire le README\n- une quatrième\n'
  expect(parseSuggestions(reply)).toEqual(['relire le diff', 'lancer les tests', 'écrire le README'])
})

test('parseSuggestions ignore le texte sans puce', () => {
  expect(parseSuggestions('Rien à proposer.')).toEqual([])
  expect(parseSuggestions('- \n-  \n')).toEqual([])
})

test('BTN donne le nom du bouton', () => {
  expect(parseLine('BTN A')).toEqual({ type: 'button', name: 'A' })
  expect(parseLine('BTN LThumb')).toEqual({ type: 'button', name: 'LThumb' })
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
  expect(parseLine('BTN')).toBeUndefined()
  expect(parseLine('PAD x down')).toBeUndefined()
  expect(parseLine('PAD 0 peut-etre')).toBeUndefined()
  expect(parseLine('AUTRE chose')).toBeUndefined()
})

test('splitLines garde le morceau incomplet pour le suivant', () => {
  expect(splitLines('BTN A\nBTN B\nBT')).toEqual({ lines: ['BTN A', 'BTN B'], rest: 'BT' })
  expect(splitLines('N X\n')).toEqual({ lines: ['N X'], rest: '' })
})
