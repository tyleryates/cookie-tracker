import { describe, expect, it } from 'vitest';
import { ALLOCATION_CHANNEL, ALLOCATION_SOURCE } from '../../constants';
import { createDataStore, type DataStore } from '../../data-store';
import type { CookieType } from '../../types';
import { importAllocations, normalizeBoothLocation } from '../importers/allocations';

describe('normalizeBoothLocation', () => {
  it('normalizes a full booth location', () => {
    const result = normalizeBoothLocation({
      id: 123,
      store_name: 'Vons',
      address: { street: '123 Main St', city: 'San Diego', state: 'CA', zip: '92101' },
      reservation_type: 'LOTTERY',
      notes: 'Near entrance'
    });
    expect(result.id).toBe(123);
    expect(result.storeName).toBe('Vons');
    expect(result.address.street).toBe('123 Main St');
    expect(result.address.city).toBe('San Diego');
    expect(result.address.state).toBe('CA');
    expect(result.address.zip).toBe('92101');
    expect(result.reservationType).toBe('LOTTERY');
    expect(result.notes).toBe('Near entrance');
  });

  it('handles alternate field names', () => {
    const result = normalizeBoothLocation({
      booth_id: 456,
      name: 'Ralphs',
      address: { address_1: '456 Oak Ave', city: 'LA', state: 'CA', postal_code: '90001' }
    });
    expect(result.id).toBe(456);
    expect(result.storeName).toBe('Ralphs');
    expect(result.address.street).toBe('456 Oak Ave');
    expect(result.address.zip).toBe('90001');
  });

  it('handles missing fields with defaults', () => {
    const result = normalizeBoothLocation({});
    expect(result.id).toBe(0);
    expect(result.storeName).toBe('');
    expect(result.address.street).toBe('');
    expect(result.reservationType).toBe('');
    expect(result.notes).toBe('');
    expect(result.availableDates).toBeUndefined();
  });

  it('normalizes available dates and time slots', () => {
    const result = normalizeBoothLocation({
      id: 1,
      availableDates: [
        {
          date: '2025-02-15',
          timeSlots: [
            { start_time: '09:00', end_time: '12:00' },
            { startTime: '13:00', endTime: '16:00' }
          ]
        }
      ]
    });
    expect(result.availableDates).toBeDefined();
    expect(result.availableDates!.length).toBe(1);
    expect(result.availableDates![0].date).toBe('2025-02-15');
    expect(result.availableDates![0].timeSlots.length).toBe(2);
    expect(result.availableDates![0].timeSlots[0].startTime).toBe('09:00');
    expect(result.availableDates![0].timeSlots[1].startTime).toBe('13:00');
  });
});

describe('importAllocations', () => {
  it('imports direct ship divider (object format)', () => {
    const store = createDataStore() as DataStore;
    importAllocations(store, {
      directShipDivider: {
        girls: [{ id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] }]
      }
    });
    expect(store.allocations.length).toBe(1);
    expect(store.allocations[0].channel).toBe(ALLOCATION_CHANNEL.DIRECT_SHIP);
    expect(store.allocations[0].girlId).toBe(42);
  });

  it('imports virtual cookie shares (skips booth divider entries)', () => {
    const store = createDataStore() as DataStore;
    importAllocations(store, {
      virtualCookieShares: [
        { girls: [{ id: 42, quantity: 3 }] }, // No smart_divider_id → manual → import
        { girls: [{ id: 43, quantity: 5 }], smart_divider_id: 'abc' } // Booth divider → skip
      ]
    });
    expect(store.virtualCookieShareAllocations.get(42)).toBe(3);
    expect(store.virtualCookieShareAllocations.has(43)).toBe(false);
  });

  it('imports reservations', () => {
    const store = createDataStore() as DataStore;
    importAllocations(store, {
      reservations: {
        reservations: [
          {
            id: 'res-1',
            troop_id: 'T3990',
            booth: { booth_id: 'B1', store_name: 'Vons', address: '123 Main' },
            timeslot: { date: '2025-02-15', start_time: '09:00', end_time: '12:00' },
            cookies: []
          }
        ]
      }
    });
    expect(store.boothReservations.length).toBe(1);
    expect(store.boothReservations[0].booth.storeName).toBe('Vons');
  });

  it('imports booth dividers with deduplication', () => {
    const store = createDataStore() as DataStore;
    const cookieIdMap: Record<string, CookieType> = { '1': 'THIN_MINTS' as CookieType };
    importAllocations(store, {
      boothDividers: [
        {
          reservationId: 'R1',
          booth: { booth_id: 'B1', store_name: 'Vons' },
          timeslot: { date: '2025-02-15', start_time: '09:00' },
          divider: {
            girls: [
              { id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] },
              { id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] } // Duplicate
            ]
          }
        }
      ],
      cookieIdMap
    });
    // Only 1 allocation (second is deduplicated)
    expect(store.allocations.length).toBe(1);
    expect(store.allocations[0].channel).toBe(ALLOCATION_CHANNEL.BOOTH);
    expect(store.allocations[0].source).toBe(ALLOCATION_SOURCE.SMART_BOOTH_DIVIDER);
  });

  it('imports direct ship dividers (legacy array format)', () => {
    const store = createDataStore() as DataStore;
    const cookieIdMap: Record<string, CookieType> = { '1': 'THIN_MINTS' as CookieType };
    importAllocations(store, {
      directShipDivider: [
        {
          orderId: 'O1',
          divider: { girls: [{ id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 3 }] }] }
        }
      ] as any,
      cookieIdMap
    });
    expect(store.allocations.length).toBe(1);
    expect(store.allocations[0].channel).toBe(ALLOCATION_CHANNEL.DIRECT_SHIP);
    expect(store.allocations[0].source).toBe(ALLOCATION_SOURCE.SMART_DIRECT_SHIP_DIVIDER);
  });

  it('imports booth locations', () => {
    const store = createDataStore() as DataStore;
    importAllocations(store, {
      boothLocations: [
        { id: 1, store_name: 'Vons', address: { street: '123 Main', city: 'SD', state: 'CA', zip: '92101' } },
        { id: 2, store_name: 'Ralphs', address: { street: '456 Oak', city: 'SD', state: 'CA', zip: '92102' } }
      ]
    });
    expect(store.boothLocations.length).toBe(2);
    expect(store.boothLocations[0].storeName).toBe('Vons');
    expect(store.boothLocations[1].storeName).toBe('Ralphs');
  });

  it('stores cookieIdMap in metadata', () => {
    const store = createDataStore() as DataStore;
    const cookieIdMap = { '1': 'THIN_MINTS' as CookieType };
    importAllocations(store, { cookieIdMap });
    expect(store.metadata.cookieIdMap).toEqual(cookieIdMap);
  });

  it('handles all-empty data gracefully', () => {
    const store = createDataStore() as DataStore;
    importAllocations(store, {});
    expect(store.allocations.length).toBe(0);
    expect(store.boothReservations.length).toBe(0);
    expect(store.boothLocations.length).toBe(0);
  });

  it('registers scouts from booth divider girls', () => {
    const store = createDataStore() as DataStore;
    const cookieIdMap: Record<string, CookieType> = { '1': 'THIN_MINTS' as CookieType };
    importAllocations(store, {
      boothDividers: [
        {
          reservationId: 'R1',
          booth: {},
          timeslot: {},
          divider: { girls: [{ id: 42, first_name: 'Jane', last_name: 'Doe', cookies: [{ id: 1, quantity: 5 }] }] }
        }
      ],
      cookieIdMap
    });
    expect(store.scouts.has('Jane Doe')).toBe(true);
  });
});
