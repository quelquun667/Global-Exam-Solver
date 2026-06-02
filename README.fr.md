# GlobalExam Solver

> **Langue / Language :** [Français](README.fr.md) | [English](README.md)

Extension Chrome / Chromium qui répond automatiquement aux exercices de [GlobalExam](https://global-exam.com), la plateforme de préparation aux examens de langue.

> ⚠️ **Avertissement** — Cet outil est fourni à des fins éducatives et d'aide à l'étude personnelle. Utilisez-le de manière responsable. Les auteurs ne sont pas affiliés à GlobalExam et déclinent toute responsabilité quant aux conséquences de son utilisation, y compris d'éventuelles sanctions de compte.

---

## État du projet

**Version actuelle : `v0.1.0`** — Pré-alpha. Plusieurs types de questions sont partiellement supportés, d'autres restent à implémenter. Bugs à prévoir.

---

## Fonctionnalités

- Lit les données live `Inertia.js` / Vue directement depuis le contexte MAIN de la page
- Détecte le type de question et applique la bonne stratégie (clic, drag, saisie)
- Supporte plusieurs catégories de questions :
  - `SINGLE_SELECTION`, `MULTIPLE_SELECTION` — choix unique / multiple
  - `SORTING_WORD`, `SORTING`, `ORDERING` — remettre des chips dans l'ordre
  - `FILL_BLANK_SELECT`, `FILL_BLANK_DRAG` — glisser des chips dans des trous
  - `ASSOCIATE`, `MATCHING`, `ASSOCIATION` — associer par paires
  - `FILL_IN_THE_BLANK`, `GAP_FILL`, `FILL_BLANK_RECON` — saisie de texte libre
- **Mode Auto** : enchaîne les exercices en continu, synchronisé sur les navigations
- **Mode Find** : résout la question actuellement affichée
- Overlay flottant en bas à droite avec bouton de debug (export JSON sanitisé)

---

## Installation

L'extension n'est **pas** publiée sur le Chrome Web Store. Il faut la charger manuellement en mode développeur.

### Option 1 — Depuis une release `.zip`

1. Téléchargez le dernier `globalexam-solver-vX.Y.Z.zip` depuis la [page Releases](https://github.com/quelquun667/GlobalExamSolver/releases).
2. Décompressez-le où vous voulez sur votre disque.
3. Ouvrez `chrome://extensions`, activez le **Mode développeur** (en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier décompressé.

### Option 2 — Depuis les sources

```bash
git clone https://github.com/quelquun667/GlobalExamSolver.git
```

Puis **Charger l'extension non empaquetée** et sélectionnez le sous-dossier `GlobalExamSolver/`.

L'extension s'active automatiquement sur toutes les pages `*.global-exam.com`.

---

## Utilisation

1. Ouvrez un exercice sur [global-exam.com](https://global-exam.com).
2. L'overlay **GE-Bot** apparaît en bas à droite.

| Bouton | Action |
|--------|--------|
| **Copy Data** | Affiche le JSON Inertia/Vue sanitisé dans la console DevTools (F12) |
| **Find** | Résout la question actuellement affichée |
| **Auto: OFF / ON** | Active / désactive l'enchaînement automatique |

Ouvrez DevTools (F12) et filtrez par `[GE-Bot]` pour voir ce que fait le bot.

---

## Structure du projet

```
GlobalExamBot/
├── GlobalExamSolver/
│   ├── manifest.json       # Déclaration Manifest V3
│   ├── main-world.js       # Tourne en MAIN world — lit l'état Vue/Inertia
│   ├── content.js          # Entrée ISOLATED — globals + logger
│   ├── data.js             # Pont : reçoit les données de main-world.js
│   ├── interactions.js     # Helpers DOM : find, click, drag, fill
│   ├── solver.js           # Logique de résolution par type de question
│   └── ui.js               # Overlay flottant
├── .github/workflows/      # CI : release zip, bump de version, lint
├── README.md               # Version anglaise
└── README.fr.md            # Ce fichier
```

### Architecture en bref

- **`main-world.js`** tourne dans le contexte MAIN de la page (déclaré via Manifest V3 `"world": "MAIN"`), ce qui lui donne accès direct à `app.__vueApp__` et `window.Inertia`. Il écoute aussi les événements de navigation et broadcast les nouvelles données via `window.postMessage`.
- **`data.js`** + **`solver.js`** + **`interactions.js`** + **`ui.js`** tournent dans le contexte ISOLATED et consomment ces messages.
- La stratégie de recherche d'élément est **inspirée de [Projet Voltaire Solver](https://github.com/quelquun667/Projet-Voltaire-Solver)** : sélecteurs DOM larges + filtrage des boutons UI + matching de texte avec normalisation.

---

## Releases & versioning

Les releases sont automatisées via GitHub Actions :

- Pousser un tag `v*.*.*` déclenche le workflow **Release**, qui crée un `.zip` de `GlobalExamSolver/` et l'attache à une nouvelle Release GitHub.
- Les mainteneurs peuvent déclencher le workflow **Bump version** manuellement pour incrémenter `manifest.json` et pousser le tag correspondant.

Le versioning suit [SemVer](https://semver.org/) — `MAJEUR.MINEUR.PATCH`.

---

## Limitations connues

- **La simulation drag & drop est fragile** — fonctionne sur les handlers Vue (la plupart de GlobalExam) mais peut ne pas se déclencher sur des interactions custom ou canvas.
- **Certains types de questions sont partiellement supportés** — voir la liste plus haut pour ce qui est couvert.
- **Pas de mode headless / isolé** — le bot vit dans votre session navigateur, donc lié à votre compte.
- **Logiciel pré-1.0** — l'API, la structure des fichiers et l'overlay peuvent changer entre versions.

---

## Contribuer

Les PR sont les bienvenues. Si vous tombez sur un type de question non supporté :

1. Cliquez **Copy Data** et copiez le JSON affiché en console.
2. Ouvrez une issue GitHub avec ce JSON (après avoir retiré toute donnée perso) et une description de l'exercice.
3. Ou ouvrez directement une PR avec une nouvelle branche dans [`solver.js`](GlobalExamSolver/solver.js).

---

## Licence

MIT — libre d'utiliser, modifier et distribuer. Voir [LICENSE](LICENSE) si présent.
