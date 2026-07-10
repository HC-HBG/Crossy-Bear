export const COLORS = {
  indigo: 0x1a1a3e,
  road: 0x23233a,
  roadDivider: 0xd8d8e0,
  river: 0x1e6fd9,
  riverDeep: 0x154f9c,
  riverSparkle: 0x3f8fe8,
  riverFroth: 0xbfe0ff,
  grass: 0x3fa34d,
  grassDark: 0x2e7d3c,
  kerb: 0x9a9aa8,
  kerbJoint: 0x7a7a88,
  bear: 0x8a5a2b,
  bearDark: 0x6e4720,
  gold: 0xf5b41e,
  goldDark: 0xb8860b,
  headlight: 0xfff2b0,
  white: 0xffffff,
  black: 0x0b0b18,
  badgeFill: 0x14142b,
  badgeRim: 0x31314f,
  woodBadge: 0x8a5a37,
  woodBadgeDark: 0x6b4226,
} as const;

/** Bright, saturated pixel-vehicle body colours — kept clearly lighter than the road at all times. */
export const VEHICLE_COLORS = {
  red: 0xe03a3a,
  blue: 0x2f6fe0,
  white: 0xe8e8ee,
  taxi: 0xf0b429,
  purple: 0x8b45f7,
} as const;

export const LANE_WIDTH = 160;
export const LANE_DEPTH = 480; // z-depth (screen-space footprint) of a lane strip

/**
 * The single source of truth for a lane's horizontal center. Vehicle travel
 * paths, the bear's hop destination, and the multiplier badge all derive
 * their x from this — never computed independently — so they can never
 * drift out of alignment with each other.
 */
export function laneCenterX(stepNumber: number): number {
  return (stepNumber - 0.5) * LANE_WIDTH;
}
