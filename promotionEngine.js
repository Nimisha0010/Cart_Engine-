/**
 * Tiered Promotional Campaign Engine
 * ===================================
 *
 * Two independent discount dimensions are evaluated and the BETTER one
 * (larger discount) is applied — campaigns "compete" for the customer
 * rather than stacking, which keeps the math predictable and avoids
 * runaway discount stacking that's hard to reason about at scale.
 *
 * 1. VALUE TIERS — scales with cart subtotal.
 *      ₹0      – ₹999.99   : 0%
 *      ₹1,000  – ₹2,999.99 : 5%
 *      ₹3,000  – ₹6,999.99 : 10%
 *      ₹7,000  – ₹14,999.99: 15%
 *      ₹15,000+            : 20%
 *
 * 2. DIVERSITY TIERS — rewards a cart that spans more distinct product
 *    categories (encourages cross-category discovery rather than
 *    single-SKU bulk buying).
 *      1 category   : 0%
 *      2 categories : 3%
 *      3 categories : 6%
 *      4 categories : 9%
 *      5+ categories: 12%
 *
 * Additionally, a flat ₹150 reward is granted when a cart simultaneously
 * clears the ₹3,000 value tier AND spans 3+ categories ("loyalty bundle
 * bonus") — this is a fixed reward layered on top of the percentage
 * discount, since it represents a distinct business incentive (basket
 * diversification) rather than a bigger version of the same discount.
 *
 * All thresholds live in one place (this file) so finance/business can
 * tune the program without touching controller logic.
 */

const VALUE_TIERS = [
  { min: 15000, rate: 0.2, label: 'Platinum Value Tier' },
  { min: 7000, rate: 0.15, label: 'Gold Value Tier' },
  { min: 3000, rate: 0.1, label: 'Silver Value Tier' },
  { min: 1000, rate: 0.05, label: 'Bronze Value Tier' },
  { min: 0, rate: 0, label: 'No Value Tier' },
];

const DIVERSITY_TIERS = [
  { min: 5, rate: 0.12, label: 'Explorer Tier (5+ categories)' },
  { min: 4, rate: 0.09, label: 'Curator Tier (4 categories)' },
  { min: 3, rate: 0.06, label: 'Mixer Tier (3 categories)' },
  { min: 2, rate: 0.03, label: 'Pairing Tier (2 categories)' },
  { min: 0, rate: 0, label: 'No Diversity Tier' },
];

const LOYALTY_BUNDLE_BONUS = {
  minSubtotal: 3000,
  minCategories: 3,
  flatReward: 150,
  label: 'Loyalty Bundle Bonus',
};

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pickTier(tiers, value) {
  return tiers.find((t) => value >= t.min);
}

/**
 * @param {Array<{quantity:number, unitPriceSnapshot:number, category:string}>} items
 * @returns {object} pricing breakdown
 */
function computeCheckoutPricing(items) {
  const subtotal = round2(
    items.reduce((sum, item) => sum + item.quantity * item.unitPriceSnapshot, 0)
  );
  const distinctCategories = new Set(items.map((i) => i.category)).size;

  const valueTier = pickTier(VALUE_TIERS, subtotal);
  const diversityTier = pickTier(DIVERSITY_TIERS, distinctCategories);

  // Competing discounts: apply whichever percentage is larger, don't stack.
  const winningTier = valueTier.rate >= diversityTier.rate ? valueTier : diversityTier;
  const percentageDiscount = round2(subtotal * winningTier.rate);

  const qualifiesForBundleBonus =
    subtotal >= LOYALTY_BUNDLE_BONUS.minSubtotal &&
    distinctCategories >= LOYALTY_BUNDLE_BONUS.minCategories;

  const flatBonus = qualifiesForBundleBonus ? LOYALTY_BUNDLE_BONUS.flatReward : 0;

  const totalDiscount = round2(percentageDiscount + flatBonus);
  const total = round2(Math.max(subtotal - totalDiscount, 0));

  return {
    subtotal,
    distinctCategories,
    evaluatedTiers: {
      value: { subtotalAtEvaluation: subtotal, tier: valueTier.label, rate: valueTier.rate },
      diversity: {
        categoriesAtEvaluation: distinctCategories,
        tier: diversityTier.label,
        rate: diversityTier.rate,
      },
    },
    appliedDiscount: {
      source: winningTier === valueTier ? 'value' : 'diversity',
      tier: winningTier.label,
      rate: winningTier.rate,
      amount: percentageDiscount,
    },
    loyaltyBundleBonus: {
      applied: qualifiesForBundleBonus,
      amount: flatBonus,
      requirement: `subtotal >= ₹${LOYALTY_BUNDLE_BONUS.minSubtotal} AND categories >= ${LOYALTY_BUNDLE_BONUS.minCategories}`,
    },
    totalDiscount,
    total,
  };
}

module.exports = {
  computeCheckoutPricing,
  VALUE_TIERS,
  DIVERSITY_TIERS,
  LOYALTY_BUNDLE_BONUS,
};
