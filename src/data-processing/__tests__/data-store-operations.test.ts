import { describe, expect, it } from 'vitest';
import { TRANSFER_CATEGORY, TRANSFER_TYPE } from '../../constants';
import { createTransfer } from '../../data-store-operations';

describe('createTransfer — category classification', () => {
  it('classifies C2T as COUNCIL_TO_TROOP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.C2T, from: 'Council', to: 'Troop' });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies C2T(P) as COUNCIL_TO_TROOP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.C2T_P, from: 'Council', to: 'Troop' });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies incoming T2T as COUNCIL_TO_TROOP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop A', to: 'Troop B', troopNumber: 'Troop B' });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies outgoing T2T as TROOP_OUTGOING', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop B', to: 'Troop A', troopNumber: 'Troop B' });
    expect(t.category).toBe(TRANSFER_CATEGORY.TROOP_OUTGOING);
  });

  it('classifies outgoing T2T when troopNumber is numeric ID and from is troop name', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop 3990', to: 'Troop 1234', troopNumber: '3990' });
    expect(t.category).toBe(TRANSFER_CATEGORY.TROOP_OUTGOING);
  });

  it('classifies incoming T2T when troopNumber is numeric ID and from is different troop', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop 1234', to: 'Troop 3990', troopNumber: '3990' });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies outgoing T2T via troopName when troopNumber is an internal ID', () => {
    const t = createTransfer({
      type: TRANSFER_TYPE.T2T,
      from: 'Troop 3990',
      to: 'Troop 1234',
      troopNumber: '54321',
      troopName: 'Troop 3990'
    });
    expect(t.category).toBe(TRANSFER_CATEGORY.TROOP_OUTGOING);
  });

  it('classifies outgoing T2T via troopName digit extraction', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop 3990', to: 'Troop 1234', troopNumber: '54321', troopName: '3990' });
    expect(t.category).toBe(TRANSFER_CATEGORY.TROOP_OUTGOING);
  });

  it('classifies incoming T2T correctly when troopName does not match from', () => {
    const t = createTransfer({
      type: TRANSFER_TYPE.T2T,
      from: 'Troop 1234',
      to: 'Troop 3990',
      troopNumber: '54321',
      troopName: 'Troop 3990'
    });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies T2T without troopNumber as COUNCIL_TO_TROOP (safe default)', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2T, from: 'Troop A', to: 'Troop B' });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });

  it('classifies G2T as GIRL_RETURN', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.G2T, from: 'Jane', to: 'Troop' });
    expect(t.category).toBe(TRANSFER_CATEGORY.GIRL_RETURN);
  });

  it('classifies plain T2G as GIRL_PICKUP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2G, from: 'Troop', to: 'Jane' });
    expect(t.category).toBe(TRANSFER_CATEGORY.GIRL_PICKUP);
  });

  it('classifies T2G + virtualBooth as VIRTUAL_BOOTH_ALLOCATION', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2G, virtualBooth: true });
    expect(t.category).toBe(TRANSFER_CATEGORY.VIRTUAL_BOOTH_ALLOCATION);
  });

  it('classifies T2G + boothDivider as BOOTH_SALES_ALLOCATION', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2G, boothDivider: true });
    expect(t.category).toBe(TRANSFER_CATEGORY.BOOTH_SALES_ALLOCATION);
  });

  it('classifies T2G + directShipDivider as DIRECT_SHIP_ALLOCATION', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.T2G, directShipDivider: true });
    expect(t.category).toBe(TRANSFER_CATEGORY.DIRECT_SHIP_ALLOCATION);
  });

  it('classifies D as DC_ORDER_RECORD', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.D });
    expect(t.category).toBe(TRANSFER_CATEGORY.DC_ORDER_RECORD);
  });

  it('classifies COOKIE_SHARE as COOKIE_SHARE_RECORD', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.COOKIE_SHARE });
    expect(t.category).toBe(TRANSFER_CATEGORY.COOKIE_SHARE_RECORD);
  });

  it('classifies COOKIE_SHARE + boothDivider as BOOTH_COOKIE_SHARE', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.COOKIE_SHARE, boothDivider: true });
    expect(t.category).toBe(TRANSFER_CATEGORY.BOOTH_COOKIE_SHARE);
  });

  it('classifies DIRECT_SHIP as DIRECT_SHIP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.DIRECT_SHIP });
    expect(t.category).toBe(TRANSFER_CATEGORY.DIRECT_SHIP);
  });

  it('classifies PLANNED as COUNCIL_TO_TROOP', () => {
    const t = createTransfer({ type: TRANSFER_TYPE.PLANNED });
    expect(t.category).toBe(TRANSFER_CATEGORY.COUNCIL_TO_TROOP);
  });
});

describe('createTransfer — physical packages', () => {
  it('separates physical packages from Cookie Share', () => {
    const t = createTransfer({
      type: TRANSFER_TYPE.T2G,
      varieties: { THIN_MINTS: 3, TREFOILS: 2, COOKIE_SHARE: 5 },
      packages: 10
    });
    expect(t.physicalPackages).toBe(5); // 3 + 2, not 10
    expect(t.physicalVarieties).toEqual({ THIN_MINTS: 3, TREFOILS: 2 });
    expect(t.physicalVarieties.COOKIE_SHARE).toBeUndefined();
  });

  it('returns 0 physical packages for pure Cookie Share transfer', () => {
    const t = createTransfer({
      type: TRANSFER_TYPE.COOKIE_SHARE,
      varieties: { COOKIE_SHARE: 5 },
      packages: 5
    });
    expect(t.physicalPackages).toBe(0);
  });
});
