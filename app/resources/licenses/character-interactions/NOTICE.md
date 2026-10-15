# Character interaction adaptations

FloatIsland keeps the local Bloub SVG renderer. No additional avatar/runtime is included.

- **Agent Robot Avatar**, CX ArtLab. Reference: https://github.com/CX-ArtLab/agent-robot-avatar . Its semantic eye feedback (waiting, success, warning, surprise and affection) inspired FloatIsland's independently implemented face layer. No upstream robot artwork, geometry or runtime code is included. FloatIsland retains its own body, neutral click geometry, selected appearance and existing task-state interface.

- **feral-blob**, mortspace, MIT. Source: https://github.com/mortspace/feral-blob/tree/3a5feee745051ace4174744ff79cc9541aa0cd3a . Adapted the `JellyBlobMascot` poke timing, six-poke window and three-poke wake policy into `avatarInteractions.ts`. Changes: pure TypeScript/time sampling, gentler local SVG squash, finite shake, no speech bubble, automatic sleep or Framer Motion dependency.
- **Agent Avatar**, joyparkray, MIT. Source: https://github.com/joyparkray/agent-avatar/tree/234ec92cf599654cc8a5173041195087812a0030 . Adapted `connectors/workbuddy`, `bridge/pascal_events.py` and `bridge/state_machine.py` observer rules: late SessionStart preservation, duplicate/event bookkeeping and concurrent subagent/tool handling. Changes: existing authenticated local Electron bridge and native hook, no Python dependency, observer-only immediate response and no approval output. The shuffled action policy maps to existing Bloub poses rather than upstream character assets.

The exact upstream MIT licenses are distributed beside this notice. Adaptation authors: FloatIsland contributors. WorkBuddy is a third-party application; no affiliation or chat API is claimed.
