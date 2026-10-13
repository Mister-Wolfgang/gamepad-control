// Contrat de types du mod : l'état lu et écrit par le panneau (atom "status")
export type PadStatus = {
  kind: 'xbox' | 'sony' | 'nintendo' | 'unknown'
  devices: string[]
  connected: boolean
  last: string
  error: string
  // Suggestions du modèle d'après la session, et file d'actions à lancer une à une
  suggestions: string[]
  queue: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'gamepad-control': { status: PadStatus }
  }
}
