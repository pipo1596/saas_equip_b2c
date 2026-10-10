// A direct port of the backend's own per-line allocation algorithm
// (SCSRTPEORD srAllocLn) — draws Units, then Dollars, then Points, in that
// order, carrying remaining balances forward across however many lines
// share the same `AllocationBalances` object. The server is still the
// source of truth: checkout re-runs this for real and rejects with RC INS
// if a line comes up short. This is a *preview*, used wherever the UI needs
// to show (or avoid overstating) coverage before that round-trip happens.

export type AllocationDrawType = 'UNITS' | 'DOLLARS' | 'POINTS';

export interface AllocationLine {
  qty: number;
  // What this line's unit price/points were captured at — the same
  // "at add" figures `resolvedAllocations` already uses elsewhere, so a
  // preview always matches what the rest of the UI shows for this line.
  priceAtAdd: number;
  pointsAtAdd: number;
}

// One rule's own balance for a single pay type, plus whatever's needed to
// test if it covers a given line. `available` is mutated in place as draws
// are taken — reuse the *same* balance objects across every line in a cart
// so later lines correctly see what earlier ones already drew.
export interface AllocationBalance {
  balanceId: number;
  ruleId: number;
  // Ascending — draw from the soonest-expiring balance first. `null` (never
  // expires) sorts after every dated balance.
  cycleEnd: string | null;
  available: number;
  coversLine(line: AllocationLine): boolean;
}

export interface AllocationBalances {
  units: AllocationBalance[];
  dollars: AllocationBalance[];
  points: AllocationBalance[];
}

export interface AllocationDraw {
  type: AllocationDrawType;
  balanceId: number;
  ruleId: number;
  amount: number;
}

export interface AllocationResult {
  draws: AllocationDraw[];
  // Checkout would reject this line (RC INS) as-is — either something's
  // still left over, or it's a free ($0) line whose unit grant ran out.
  short: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Ascending by `cycleEnd` (never-expiring last), then `balanceId` — the
// exact order the backend draws in. Sorts a copy; never mutates the array a
// caller passed in (the balance *objects* inside it still get mutated by
// `allocateLine` itself, by design — see `AllocationBalance.available`).
function sortBalances(balances: readonly AllocationBalance[]): AllocationBalance[] {
  return [...balances].sort((a, b) => {
    if (a.cycleEnd !== b.cycleEnd) {
      if (a.cycleEnd === null) return 1;
      if (b.cycleEnd === null) return -1;
      return a.cycleEnd < b.cycleEnd ? -1 : 1;
    }
    return a.balanceId - b.balanceId;
  });
}

// Mirrors the reference implementation's `allocateLine` line for line —
// see the module comment for what this is (and isn't) a substitute for.
export function allocateLine(line: AllocationLine, balances: AllocationBalances): AllocationResult {
  const draws: AllocationDraw[] = [];
  let qtyLeft = line.qty;

  // 1. Units — whole units only, never a fraction of one.
  const unitBals = sortBalances(balances.units).filter((b) => b.coversLine(line));
  const unitScope = unitBals.length > 0;
  for (const b of unitBals) {
    if (qtyLeft === 0) break;
    const take = Math.min(Math.floor(b.available), qtyLeft);
    if (take < 1) continue;
    b.available -= take;
    qtyLeft -= take;
    draws.push({ type: 'UNITS', balanceId: b.balanceId, ruleId: b.ruleId, amount: take });
  }
  if (qtyLeft === 0) {
    return { draws, short: false };
  }

  // 2. Dollars — the scope test runs even for a $0 line; a dollar rule
  // that's in scope but empty still blocks points below, so `dollarScope`
  // means "covers it", not "has anything left".
  let amtLeft = round2(qtyLeft * line.priceAtAdd);
  let free = amtLeft === 0;
  const dollarBals = sortBalances(balances.dollars).filter((b) => b.coversLine(line));
  const dollarScope = dollarBals.length > 0;
  for (const b of dollarBals) {
    if (amtLeft <= 0) break;
    if (b.available <= 0) continue;
    const take = Math.min(b.available, amtLeft);
    b.available -= take;
    amtLeft -= take;
    draws.push({ type: 'DOLLARS', balanceId: b.balanceId, ruleId: b.ruleId, amount: take });
  }

  // 3. Points — only when no dollar rule covers the line at all.
  if (!dollarScope && line.pointsAtAdd > 0) {
    amtLeft = qtyLeft * line.pointsAtAdd;
    free = false;
    const pointsBals = sortBalances(balances.points).filter((b) => b.coversLine(line));
    for (const b of pointsBals) {
      if (amtLeft <= 0) break;
      if (b.available <= 0) continue;
      const take = Math.min(b.available, amtLeft);
      b.available -= take;
      amtLeft -= take;
      draws.push({ type: 'POINTS', balanceId: b.balanceId, ruleId: b.ruleId, amount: take });
    }
  }

  // 4. Short check — leftover qty/amount, or a free unit-granted line whose
  // units ran out (a $0 line can't "pay" its way past an empty unit grant).
  const short = (free && unitScope) || amtLeft > 0;
  return { draws, short };
}
