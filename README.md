# Syntra Veyra

Veyra is Syntra's local AI system.

## What is included

- Veyra Neo, Cipher, Vanta and Zenith modes
- Low, Medium, High, Extra High, Ultra and Overdrive effort
- ARATIS: Anti Regrettable Adapt Thinking Integration System
- Five trained minds:
  - General Mind
  - Reasoning Mind
  - Builder Mind
  - Context Mind
  - ARATIS Brainstem
- First-run parallel training
- Turbo Knowledge starter download
- Persistent memory
- Exact math/code helpers
- Windows desktop UI
- One-time installation
- GitHub Releases auto-updates
- Differential Windows update packages through electron-builder/NSIS

## Permanent data

Veyra keeps user-owned AI data outside the application files:

`%APPDATA%\Syntra\Veyra`

Normal application updates do not intentionally erase that directory.

## First setup

The first run trains the five minds in parallel. Each mind is configured for at
least 10 minutes of local training. Starter knowledge downloads at the same time.
ARATIS is tested before Veyra marks setup complete.

After that, Veyra launches normally unless the user deletes/resets the local AI.

## Updates

The desktop app checks GitHub Releases for:

`klyptixxyz-syntra/syntra-veyra`

Users install the full app once. Later releases can be installed from inside Veyra.

## Important reality

This is a real local multi-model architecture, but a ten-minute local training
session cannot produce a frontier-scale neural model. ARATIS, exact solvers,
memory, retrieval and the five specialized minds are used to make the smaller
local models more useful and reliable.
