// Points-earning rule, centralized so it can change (or later move to
// a DB-configurable table) without hunting through booking logic.
// Rule: 1 point per 100 THB spent, scaled by the user's tier multiplier.
const BASE_POINTS_PER_CURRENCY_UNIT = 1 / 100; // 1 point per 100 THB

function calculatePendingPoints(amount, tierMultiplier = 1.0) {
  return Math.floor(amount * BASE_POINTS_PER_CURRENCY_UNIT * tierMultiplier);
}

module.exports = { calculatePendingPoints };
