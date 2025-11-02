const MODULE_ID = "pf2e-kineticist-auras";

/* -------------------------------------------- */
/* Settings                                     */
/* -------------------------------------------- */

function registerSettings() {
  // Visible in Configure Settings -> World (v13)
  game.settings.register(MODULE_ID, "debugLogging", {
    name: "Enable debug logging",
    hint: "If enabled, PF2e Kineticist Auras will log internal actions (aura detection, effect creation/removal) to the browser console for debugging.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

Hooks.once("init", () => {
  console.log(`[${MODULE_ID}] init OK - registering settings`);
  registerSettings();
});

/**
 * Helper to read the debug flag without crashing if something weird happens.
 */
function isDebugEnabled() {
  try {
    return game.settings.get(MODULE_ID, "debugLogging");
  } catch (err) {
    // happens if called super early or setting missing
    return false;
  }
}

/**
 * Conditional console.log
 */
function debugLog(...args) {
  if (!isDebugEnabled()) return;
  console.log(`[${MODULE_ID}]`, ...args);
}

/* -------------------------------------------- */
/* Core Hooks: create/delete ActiveEffect       */
/* -------------------------------------------- */

Hooks.on("createActiveEffect", async (effect, options, userId) => {
  // Only let the active GM handle this to avoid duplicate spam
  if (!game.user.isGM) return;

  const actor = effect.parent;
  if (!actor || actor.type !== "character") return;

  const newName = (effect.name ?? "").toLowerCase();
  if (!newName.includes("kinetic aura")) return;

  debugLog("createActiveEffect detected kinetic aura on actor", actor.name, {
    effectName: effect.name,
    effectId: effect.id
  });

  // Get all gates the actor can channel (Air, Fire, etc.)
  const elements = getActorGates(actor);
  debugLog("Detected gates for actor", actor.name, elements);

  if (!elements.length) {
    debugLog("No gates found; skipping aura tag creation.");
    return;
  }

  // Clean up old aura tags we created
  await cleanupModuleAuras(actor);

  // Build new aura tag effects and create them
  const newEffectsData = elements.map(el => makeElementAuraEffect(el));
  debugLog("Creating aura tag effects", newEffectsData);

  if (newEffectsData.length > 0) {
    await actor.createEmbeddedDocuments("Item", newEffectsData);
    debugLog("Aura tag effects created on actor", actor.name);
  }
});


Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (!game.user.isGM) return;

  const actor = effect.parent;
  if (!actor || actor.type !== "character") return;

  const oldName = (effect.name ?? "").toLowerCase();
  if (!oldName.includes("kinetic aura")) return;

  debugLog("deleteActiveEffect saw kinetic aura removed from actor", actor.name, {
    effectName: effect.name,
    effectId: effect.id
  });

  // PF2e can apply multiple "kinetic aura" effects (one per gate).
  // We only turn off visuals if ALL of them are gone.
  const stillHasKineticAura = actor.effects.some(eff =>
    (eff.name ?? "").toLowerCase().includes("kinetic aura")
  );

  debugLog("Actor still has any PF2e kinetic aura?", stillHasKineticAura);

  if (stillHasKineticAura) {
    debugLog("At least one aura remains; leaving our VFX tags in place.");
    return;
  }

  debugLog("No kinetic aura effects remain; cleaning up our VFX aura tags.");
  await cleanupModuleAuras(actor);
});

/* -------------------------------------------- */
/* Gate detection                               */
/* -------------------------------------------- */

/**
 * Find which elemental gates the actor has access to.
 * Returns e.g. ["Fire", "Metal"].
 *
 * This scans feats/class features. You can tighten the regex patterns
 * once you see the exact Gate item names in your world.
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
    // kineticist gates should appear as feats or class features
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
  debugLog("getActorGates()", actor.name, "->", gates);
  return gates;
}

/* -------------------------------------------- */
/* VFX tag creation & cleanup                   */
/* -------------------------------------------- */

/**
 * Build one of our cosmetic aura tag effects.
 * These are named "Kinetic Aura: <Element>" and are meant to be
 * watched by Automated Animations for persistent auras.
 */
function makeElementAuraEffect(elementType) {
  const auraName = `Kinetic Aura: ${elementType}`;

  const effectData = {
    name: auraName,
    type: "effect",
    img: pickIconForElement(elementType),
    system: {
      tokenIcon: { show: true }, // makes it visible on the token HUD
      duration: {
        unit: "unlimited",
        value: null,
        sustained: false
      },
      rules: [] // no mechanical bonuses, just a tag
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
 * Remove all aura tag effects created by this module,
 * leaving PF2e's own kinetic aura effects untouched.
 */
async function cleanupModuleAuras(actor) {
  const ours = actor.effects.filter(
    eff => eff.flags?.[MODULE_ID]?.generatedByKineticAura === true
  );

  debugLog("cleanupModuleAuras() found", ours.length, "effects:", ours.map(e => e.name));

  if (!ours.length) return;

  const toRemoveIds = ours.map(e => e.id);
  await actor.deleteEmbeddedDocuments("Item", toRemoveIds);

  debugLog("cleanupModuleAuras() removed aura tag effects from actor", actor.name);
}

/* -------------------------------------------- */
/* Icon helper                                  */
/* -------------------------------------------- */

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
