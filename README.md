# PF2e Kineticist Auras - Still under development

Foundry VTT module for Pathfinder 2e (PF2e system), targeting Foundry VTT V13.

When a kineticist uses **Channel Elements** and creates their kinetic aura, this module automatically:
- Adds cosmetic Active Effects to the actor called:
  - `Kinetic Aura: Air`
  - `Kinetic Aura: Earth`
  - `Kinetic Aura: Fire`
  - `Kinetic Aura: Metal`
  - `Kinetic Aura: Water`
  - `Kinetic Aura: Wood`
  (one per gate they have access to)
- These effects are meant to be picked up by **Automated Animations**, so you can give each element its own persistent aura VFX around the token.
- When the kinetic aura ends (all `Effect: Kinetic Aura` effects are gone), the module removes those cosmetic tags so the visuals turn off.

## Why this exists

This allows for animations for each of a kineticist's kinetic gates and allows multiple kineticists to have different auras.

This module:
- Detects which gates the actor actually has (Air / Earth / Fire / Metal / Water / Wood).
- Keeps those element tags in sync with whether the kinetic aura is active.
- Supports multi-gate kineticists (e.g. Fire + Metal both active at once).
- Cleans up automatically on Dismiss / overflow / KO.

## How to use

1. Install this module into your Foundry data folder under:
   `Data/modules/pf2e-kineticist-auras`
   or install via the manifest URL: https://raw.githubusercontent.com/Dwank-P/pf2e-kineticist-auras/main/module.json

2. Enable **PF2e Kineticist Auras** in *Manage Modules* for your world.

3. In **Automated Animations**:
   - Create persistent aura animations that trigger when an actor has an Active Effect named, for example, `Kinetic Aura: Fire`.
   - Repeat for each element you want (Air, Earth, Fire, Metal, Water, Wood).
   - You can stack multiple persistent effects if the kineticist has multiple gates.

4. Test with a kineticist:
   - Use Channel Elements.
   - You should now see new effects on the actor matching their gates.
   - Automated Animations should spawn the appropriate elemental VFX.

When the kinetic aura ends (all copies of PF2e's `Effect: Kinetic Aura` are removed), the module automatically deletes those `Kinetic Aura: <Element>` effects. The VFX should stop.

## Notes

- This module does not add any mechanical bonuses or rules. The effects it creates are cosmetic tags only.
- We intentionally do **not** delete PF2e's own `Effect: Kinetic Aura` effects. We only mirror them and watch for them to disappear.

## Foundry / System Requirements

- Foundry VTT V13
- PF2e system
- Automated Animations (for the actual aura visuals)

## License

MIT


