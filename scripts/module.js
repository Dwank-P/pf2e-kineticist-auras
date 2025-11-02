const MODULE_ID = "pf2e-kineticist-auras";

/**
 * Fired whenever an ActiveEffect is created on any actor.
 * We care when PF2e applies kinetic aura from Channel Elements.
 */
Hooks.on("createActiveEffect", async (effect, options, userId) => {
  // Only the GM should apply/remove module-generated effects, to avoid duplicates.
  if (!game.user.isGM) return;

  // This effect should belong to an Actor.
  const actor = effect.parent;
  if (!actor || actor.type !== "character") return;

  // We only trigger off PF2e's aura from Channel Elements.
  // PF2e usually names that effect "Effect: Kinetic Aura".
  const newName = (effect.name ?? "").toLowerCase();
  if (!newName.includes("kinetic aura")) return;

  // 1. Figure out which elements (gates) this kineticist can channel.
  // Rules: a kineticist with multiple gates channels *all* of them at once.
  const elements = getActorGates(actor);
  if (!elements.length) return;

  // 2. Clean up any aura tag effects *we* previously generated.
  // We do this up front so we can then recreate the fresh correct set.
  await cleanupModuleAuras(actor);

  // 3. Create a "Kinetic Aura: <Element>" effect for each gate they have.
  // Automated Animations will key off these names and show VFX.
  const newEffectsData = elements.map(el => makeElementAuraEffect(el));
  if (newEffectsData.length > 0) {
    await actor.createEmbeddedDocuments("Item", newEffectsData);
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

  // PF2e may apply multiple aura effects (one per gate).
  // We only remove our visuals when the *last* one is gone.
  const stillHasKineticAura = actor.effects.some(eff =>
    (eff.name ?? "").toLowerCase().includes("kinetic aura")
  );

  if (stillHasKineticAura) {
    // Aura is still active in some form; keep visuals.
    return;
  }

  // All PF2e aura effects are gone => remove our aura tags so VFX stop.
  await cleanupModuleAuras(actor);
});


/**
 * Returns an array of element names this kineticist can channel.
 * Example: ["Fire", "Metal"]
 *
 * We inspect the actor's class features / feats to detect their Gates.
 * You should tighten the regex to match how PF2e actually names them on your sheet:
 * e.g. if it literally says "Fire Gate", "Metal Gate", etc.
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
    // PF2e kineticist gates live in class features / feats.
    if (!["feat", "classfeature"].includes(item.type)) continue;

    const itemName = item.name ?? "";
    const desc = item.system?.description?.value ?? "";

    for (const [elementName, rx] of Object.entries(GATE_MAP)) {
      if (rx.test(itemName) || rx.test(desc)) {
        found.add(elementName);
      }
    }
  }

  return Array.from(found);
}


/**
 * Build a lightweight Active Effect for one element.
 * These are cosmetic "tags" only: no mechanical rules.
 *
 * Name pattern is important:
 *    "Kinetic Aura: Fire"
 *    "Kinetic Aura: Metal"
 *
 * You'll point Automated Animations at those names to spawn persistent auras.
 */
function makeElementAuraEffect(elementType) {
  const auraName = `Kinetic Aura: ${elementType}`;

  return {
    name: auraName,
    type: "effect",
    img: pickIconForElement(elementType),
    system: {
      tokenIcon: { show: true }, // show as a status icon on the token HUD
      duration: {
        unit: "unlimited",
        value: null,
        sustained: false
      },
      rules: [] // no gameplay impact
    },
    flags: {
      [MODULE_ID]: {
        generatedByKineticAura: true,
        element: elementType
      }
    }
  };
}


/**
 * Remove all aura tag effects that *we* created, without touching PF2e's real effects.
 */
async function cleanupModuleAuras(actor) {
  const ours = actor.effects.filter(eff =>
    eff.flags?.[MODULE_ID]?.generatedByKineticAura === true
  );

  if (!ours.length) return;

  const toRemoveIds = ours.map(e => e.id);
  await actor.deleteEmbeddedDocuments("Item", toRemoveIds);
}


/**
 * Return a token icon per element. You can swap these for any art you like.
 * These icons are just for visual clarity in the UI.
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
