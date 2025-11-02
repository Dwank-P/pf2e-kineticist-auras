const MODULE_ID = "pf2e-kineticist-auras";

/* -------------------------------------------- */
/* Settings                                     */
/* -------------------------------------------- */

/**
 * Register module settings so GMs can toggle debug logging.
 * This appears in Configure Settings -> World.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "debugLogging", {
    name: "Enable debug logging",
    hint: "If enabled, PF2e Kineticist Auras will log internal actions (aura detection, effect creation/removal) to the browser console for debugging.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

// Make sure settings are registered before the world finishes loading.
Hooks.once("init", () => {
  console.log(`[${MODULE_ID}] init OK - registering settings`);
  registerSettings();
});

/* -------------------------------------------- */
/* Debug Helpers                                */
/* -------------------------------------------- */

/**
 * Returns true if debug logging is enabled in settings.
 * Safe-guarded so calls before init don't explode.
 */
function isDebugEnabled() {
  try {
    return game.settings.get(MODULE_ID, "debugLogging");
  } catch {
    return false;
  }
}

/**
 * Conditional console.log that respects isDebugEnabled().
 */
function debugLog(...args) {
  if (!isDebugEnabled()) return;
  console.log(`[${MODULE_ID}]`, ...args);
}

/* -------------------------------------------- */
/* Hooks: PF2e aura item added / removed        */
/* -------------------------------------------- */

/**
 * PF2e applies kinetic aura(s) as embedded Items of type "effect",
 * usually named "Effect: Kinetic Aura".
 *
 * We listen for those being added to an actor. On the first aura item,
 * we add our cosmetic aura tags (Kinetic Aura: Fire, etc.) exactly once.
 */
Hooks.on("createItem", async (item, options, userId) => {
  // Only run from an active GM so players don't double-fire this.
  if (!game.user.isGM) return;

  const actor = item.parent;
  if (!actor || actor.type !== "character") return;

  // Only care about PF2e effect items.
  if (item.type !== "effect") return;

  const name = (item.name ?? "").toLowerCase();
  if (!name.includes("kinetic aura")) return;

  debugLog("Kinetic Aura effect ADDED to actor", actor.name, {
    effectName: item.name,
    effectId: item.id
  });

  // Do we already have our custom aura VFX tags on this actor?
  // If yes, don't add them again.
  const alreadyHasOurAuras = actor.items.some(i =>
    i.type === "effect" &&
    i.flags?.[MODULE_ID]?.generatedByKineticAura === true
  );

  if (alreadyHasOurAuras) {
    debugLog("Actor already has module aura tags; skipping new tag creation.");
    return;
  }

  // Figure out which elements (gates) the kineticist can channel.
  // Channel Elements can show ALL gates at once.
  const elements = getActorGates(actor);
  debugLog("Detected gates for actor", actor.name, elements);

  if (!elements.length) {
    debugLog("No gates found; skipping aura tag creation.");
    return;
  }

  // Build our cosmetic aura tags.
  const newEffectsData = elements.map(el => makeElementAuraEffect(el));
  debugLog("Creating aura tag effects", newEffectsData);

  if (newEffectsData.length > 0) {
    await actor.createEmbeddedDocuments("Item", newEffectsData);
    debugLog("Aura tag effects created on actor", actor.name);
  }
});

/**
 * PF2e also removes those "Effect: Kinetic Aura" items from the actor
 * when the aura ends (dismissed, overflow, KO, etc.).
 *
 * We listen for removals and ONLY clean up our cosmetic aura tags
 * if the actor no longer has ANY actual PF2e kinetic aura effects.
 */
Hooks.on("deleteItem", async (item, options, userId) => {
  if (!game.user.isGM) return;

  const actor = item.parent;
  if (!actor || actor.type !== "character") return;

  if (item.type !== "effect") return;

  const name = (item.name ?? "").toLowerCase();
  if (!name.includes("kinetic aura")) return;

  debugLog("Kinetic Aura effect REMOVED from actor", actor.name, {
    effectName: item.name,
    effectId: item.id
  });

  // Does the actor STILL have any PF2e kinetic aura effects?
  // IMPORTANT: We must ignore our own cosmetic aura tags here
  // (they also have "Kinetic Aura:" in the name).
  const stillHasRealAura = actor.items.some(i => {
    if (i.type !== "effect") return false;
    const iname = (i.name ?? "").toLowerCase();
    if (!iname.includes("kinetic aura")) return false;
    // Ignore our module-created "Kinetic Aura: Fire" etc.
    if (i.flags?.[MODULE_ID]?.generatedByKineticAura === true) return false;
    // If it's PF2e's own aura (no module flag), count it.
    return true;
  });

  debugLog("Actor still has PF2e kinetic aura effects?", stillHasRealAura);

  if (stillHasRealAura) {
    debugLog("At least one PF2e aura remains; keeping module VFX tags active.");
    return;
  }

  // All PF2e aura effects are gone -> remove our cosmetic aura tags.
  debugLog("No PF2e kinetic aura effects remain; cleaning up module VFX tags.");
  await cleanupModuleAuras(actor);
});

/* -------------------------------------------- */
/* Gate Detection                               */
/* -------------------------------------------- */

/**
 * Detect which elemental gates (Air, Earth, Fire, Metal, Water, Wood)
 * the kineticist has access to.
 *
 * We scan the actor's feats/class features to see which "Gate" features
 * they have. You can tighten these regexes to exactly match your table's
 * naming (like /^Fire Gate$/i) once you inspect an actual kineticist actor.
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
    // kineticist gates typically live under feats / classfeature
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
/* Cosmetic Aura Tag Helpers                    */
/* -------------------------------------------- */

/**
 * Build one cosmetic aura tag effect for Automated Animations.
 *
 * These are named "Kinetic Aura: Fire", "Kinetic Aura: Metal", etc.
 * They have:
 *   - type: "effect"
 *   - no mechanical rules
 *   - a flag so we know which ones are ours
 *
 * Automated Animations can then key off these names to play persistent
 * looping auras on the token.
 */
function makeElementAuraEffect(elementType) {
  const auraName = `Kinetic Aura: ${elementType}`;

  const effectData = {
    name: auraName,
    type: "effect",
    img: pickIconForElement(elementType),
    system: {
      tokenIcon: { show: true }, // show it in token HUD/status
      duration: {
        unit: "unlimited",
        value: null,
        sustained: false
      },
      rules: [] // purely cosmetic tag, no bonuses
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
 * Remove all our cosmetic aura tag effects from an actor.
 * We do this once PF2e's actual kinetic aura effects are gone.
 */
async function cleanupModuleAuras(actor) {
  // Only grab OUR effects, not PF2e's.
  const ours = actor.items.filter(
    i =>
      i.type === "effect" &&
      i.flags?.[MODULE_ID]?.generatedByKineticAura === true
  );

  debugLog("cleanupModuleAuras() removing", ours.map(e => e.name));

  if (!ours.length) return;

  const toRemoveIds = ours.map(e => e.id);
  await actor.deleteEmbeddedDocuments("Item", toRemoveIds);

  debugLog("cleanupModuleAuras() removed aura tag effects from actor", actor.name);
}

/* -------------------------------------------- */
/* Icon Picker                                  */
/* -------------------------------------------- */

/**
 * Pick a token icon per element type so the GM can tell at a glance
 * which element's VFX is currently being shown. Swap these for any art.
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
