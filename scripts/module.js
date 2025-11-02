const MODULE_ID = "pf2e-kineticist-auras";

/**
 * Register module settings (runs on Foundry init).
 * We add a world-scoped checkbox: "Enable debug logging".
 */
Hooks.on("init", () => {
  game.settings.register(MODULE_ID, "debugLogging", {
    name: "Enable debug logging",
    hint: "If enabled, PF2e Kineticist Auras will log its internal actions (aura detection, effect creation/removal) to the browser console for debugging.",
    scope: "world",        // world-level so the GM controls it
    config: true,          // show in the module settings UI
    type: Boolean,
    default: false
  });
});

/**
 * Convenience: only log if debugLogging is enabled.
 */
function debugLog(...args) {
  const enabled = game.settings.get(MODULE_ID, "debugLogging");
  if (!enabled) return;
  console.log(`[${MODULE_ID}]`, ...args);
}

/**
 * Fired whenever an ActiveEffect is created on any actor.
 * We care when PF2e applies kinetic aura from Channel Elements.
 */
Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (!game.user.isGM) return;

  const actor = effect.parent;
  if (!actor || actor.type !== "character") return;

  const newName = (effect.name ?? "").toLowerCase();
  if (!newName.includes("kinetic aura")) return;

  debugLog("Detected new kinetic aura effect on actor", actor.name, {
    effectName: effect.name,
    effectId: effect.id
  });

  // 1. What elements can this kineticist channel?
  const elements = getActorGates(actor);
  debugLog("Resolved actor gates", elements);

  if (!elements.length) {
    debugLog("No gates found for actor; skipping aura tag creation.");
    return;
  }

  // 2. Clean up old module aura tags so we can recreate the fresh correct set.
  await cleanupModuleAuras(actor);

  // 3. Create new aura tag effects for Automated Animations.
  const newEffectsData = elements.map(el => makeElementAuraEffect(el));
  debugLog("Creating module aura tag effects", newEffectsData);

  if (newEffectsData.length > 0) {
    await actor.createEmbeddedDocuments("Item", newEffectsData);
    debugLog("Created aura tag effects on actor", actor.name);
  }
});

/**
 * Fired whenever an ActiveEffect is deleted from an actor.
 * We care if (and only if) it's one of the PF2e kinetic aura effects.
 * We remove our aura VFX tags only if *all* PF2e aura copies are now gone.
 */
Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (!game.user.isGM) return;

  const actor = effect.parent;
  if (!actor || actor.type !== "character") return;

  const oldName = (effect.name ?? "").toLowerCase();
  if (!oldName.includes("kinetic aura")) return;

  debugLog("Kinetic aura effect removed from actor", actor.name, {
    effectName: effect.name,
    effectId: effect.id
  });

  // Check if any kinetic aura effects are still active.
  const stillHasKineticAura = actor.effects.some(eff =>
    (eff.name ?? "").toLowerCase().includes("kinetic aura")
  );

  debugLog("Does actor still have any kinetic aura effects?", stillHasKineticAura);

  if (stillHasKineticAura) {
    debugLog("At least one kinetic aura remains; keeping module aura tags in place.");
    return;
  }

  // All PF2e kinetic aura effects are gone.
  debugLog("No kinetic aura effects remain; cleaning up module aura tags.");
  await cleanupModuleAuras(actor);
});

/**
 * Returns an array of element names this kineticist can channel.
 * Example: ["Fire", "Metal"]
 *
 * We scan the actor's feats / class features for gate names.
 * Tune the regexes here to match how your PF2e world names / describes gates.
 */
function getActorGates(actor) {
  const GATE_MAP = {
    Air: /(^|\b)air\s*gate(\b|$)|gate[:\s]*air/i,
    Earth: /(^|\b)earth\s*gate(\b|$)|gate[:\s]*earth/i,
    Fire: /(^|\b)fire\s*gate(\b|$)|gate[:\s]*fire/i,
    Metal: /(^|\b)metal\s*gate(\b|$)|gate[:\s]*metal/i,
    Water: /(^|\b)water\s*gate(\b|$)|gate[:\s]*water|(^|\b)ice\s*gate(\b|$)/i,
    Wood: /(^|\b)wood\s*gate(\b|$)|gate[:\s]*wood|(^|\b)plant\s*gate(\b|$)/i
  };

  const found = new Set();

  for (const item of actor.items) {
    if (!["feat", "classfeature"].includes(item.type)) continue;

    const itemName = item.name ?? "";
    const desc = item.system?.description?.value ?? "";

    for (const [elementName, rx] of Object.entries(GATE_MAP)) {
      if (rx.test(itemName) || rx.test(desc)) {
        found.add(elementName);
      }
    }
  }

  const gates = Array.from(found);
  debugLog("getActorGates() for actor", actor.name, "=>", gates);
  return gates;
}

/**
 * Build a lightweight Active Effect for one element.
 * These are cosmetic "tags" for Automated Animations, not mechanical buffs.
 *
 * The name matters:
 *   "Kinetic Aura: Fire"
 *   "Kinetic Aura: Metal"
 *   etc.
 */
function makeElementAuraEffect(elementType) {
  const auraName = `Kinetic Aura: ${elementType}`;
  const effectData = {
    name: auraName,
    type: "effect",
    img: pickIconForElement(elementType),
    system: {
      tokenIcon: { show: true },
      duration: {
        unit: "unlimited",
        value: null,
        sustained: false
      },
      rules: []
    },
    flags: {
      [MODULE_ID]: {
        generatedByKineticAura: true,
        element: elementType
      }
    }
  };

  debugLog("makeElementAuraEffect()", effectData);
  return effectData;
}

/**
 * Remove all aura tag effects that *we* previously created,
 * leaving PF2e's own kinetic aura effects untouched.
 */
async function cleanupModuleAuras(actor) {
  const ours = actor.effects.filter(
    eff => eff.flags?.[MODULE_ID]?.generatedByKineticAura === true
  );

  debugLog("cleanupModuleAuras() found", ours.length, "effects to remove", ours.map(e => e.name));

  if (!ours.length) return;

  const toRemoveIds = ours.map(e => e.id);
  await actor.deleteEmbeddedDocuments("Item", toRemoveIds);

  debugLog("cleanupModuleAuras() removed aura tag effects from actor", actor.name);
}

/**
 * Pick an icon for the cosmetic aura tag.
 * You can change these to any asset paths you like.
 */
function pickIconForElement(elementType) {
  switch (String(elementType).toLowerCase()) {
    case "air":
      return "icons/magic/air/wind-vortex-swirl.webp";
    case "earth":
      return "icons/magic/earth/strike-fist-stone.webp";
    case "fire":
      return "icons/magic/fire/flame-burning-hand.webp";
    case "metal":
      return "icons/weapons/swords/sword-steel-broad.webp";
    case "water":
      return "icons/magic/water/wave-water-blue.webp";
    case "wood":
      return "icons/magic/nature/root-vine-entangle.webp";
    default:
      return "icons/magic/elemental/elemental-generic.webp";
  }
}
