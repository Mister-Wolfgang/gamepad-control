# gamepad-control

Mod pour Claude Code qui pilote une session à la manette et affiche les touches dans un panneau.

- **Détection de la manette** : marque (Xbox, PlayStation, Nintendo) d'après l'identifiant USB, et lecture des boutons via XInput.
- **Panneau « Manette »** : état de connexion, dernière touche, légende, et boutons cliquables.
- **Commande** : `/gamepad` rouvre le panneau.

## Touches

| Bouton | Action |
| :- | :- |
| A | Envoie le brouillon de la zone de saisie, puis vide la saisie |
| B | Interrompt le tour en cours |
| X | Envoie « Continue. » |
| Y | Vide le brouillon |
| Start | Demande au modèle trois actions possibles, d'après la session en cours |
| Back | Lance le premier élément de la file |

Les suggestions se choisissent dans le panneau (« Ajouter à la file ») et s'enchaînent une à une.

**Coût** : Start envoie le transcript de la session au modèle (`$.model.fork`). Chaque appel consomme des tokens, sur le modèle de la session.

## Limites

- **Windows uniquement** : le helper est un script PowerShell qui interroge `xinput1_4.dll`.
- **Boutons lus via XInput** : les manettes Xbox sont lues directement. Les manettes PlayStation et Nintendo ne sont lues que si Steam Input ou DS4Windows les expose en XInput. Sans cela, la marque est détectée mais aucun bouton n'est reçu.
- Les noms de manette viennent de Windows (par exemple « Périphérique HID compatible XINPUT »).
- Un mod n'est pas sandboxé : il agit avec tes permissions. N'installe que ce que tu as lu.

## Installation

Dans Claude Code :

```
/plugin marketplace add Mister-Wolfgang/gamepad-control
/plugin install gamepad-control@gamepad-control
```

Pour un essai local depuis un clone :

```
claude --plugin-dir /chemin/vers/gamepad-control
```

## Développement

```
claude plugin validate .
claude plugin test .
```

Le parseur du protocole du helper (`hooks/parse.ts`) est couvert par `hooks/parse.test.ts`. Le helper écrit des lignes texte sur sa sortie standard : `READY`, `DEVICE <marque> <nom>`, `PAD <index> <up|down>`, `BTN <nom>`, `ERROR <message>`.

## Licence

MIT, voir [LICENSE](LICENSE).
