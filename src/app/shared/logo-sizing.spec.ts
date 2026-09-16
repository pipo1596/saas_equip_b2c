import { computeAdaptiveLogoHeight } from './logo-sizing';

describe('computeAdaptiveLogoHeight', () => {
  it('clamps a squarer logo up to the max height', () => {
    expect(computeAdaptiveLogoHeight(200, 180, 130, 36, 52)).toBe(52);
  });

  it('clamps a wide banner logo down to the min height', () => {
    expect(computeAdaptiveLogoHeight(400, 60, 130, 36, 52)).toBe(36);
  });

  it('uses the exact height implied by the ratio when within bounds', () => {
    expect(computeAdaptiveLogoHeight(260, 100, 130, 36, 52)).toBe(50);
  });
});
