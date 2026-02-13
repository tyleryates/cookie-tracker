import { describe, expect, it } from 'vitest';
import { validateDCData, validateSCOrders } from '../validators';

// ============================================================================
// validateSCOrders
// ============================================================================

describe('validateSCOrders', () => {
  it('accepts valid SC orders response', () => {
    const result = validateSCOrders({
      orders: [{ order_number: '100' }, { order_number: 200 }]
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts response with extra fields (passthrough)', () => {
    const result = validateSCOrders({
      orders: [{ order_number: '100', extra_field: true }],
      total_count: 1
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing orders array', () => {
    const result = validateSCOrders({});
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects non-object input', () => {
    const result = validateSCOrders('not an object');
    expect(result.valid).toBe(false);
  });

  it('rejects null input', () => {
    const result = validateSCOrders(null);
    expect(result.valid).toBe(false);
  });

  it('rejects orders with missing order_number', () => {
    const result = validateSCOrders({
      orders: [{ type: 'C2T' }]
    });
    expect(result.valid).toBe(false);
  });

  it('accepts empty orders array', () => {
    const result = validateSCOrders({ orders: [] });
    expect(result.valid).toBe(true);
  });

  it('accepts order_number as string or number', () => {
    const withString = validateSCOrders({ orders: [{ order_number: '100' }] });
    const withNumber = validateSCOrders({ orders: [{ order_number: 100 }] });
    expect(withString.valid).toBe(true);
    expect(withNumber.valid).toBe(true);
  });
});

// ============================================================================
// validateDCData
// ============================================================================

describe('validateDCData', () => {
  it('accepts valid DC data rows', () => {
    const result = validateDCData([
      {
        'Girl First Name': 'Jane',
        'Order Number': '1001',
        'Other Column': 'value'
      }
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects empty array', () => {
    const result = validateDCData([]);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('DC data is empty or not an array');
  });

  it('rejects non-array input', () => {
    const result = validateDCData('not an array');
    expect(result.valid).toBe(false);
  });

  it('rejects null input', () => {
    const result = validateDCData(null);
    expect(result.valid).toBe(false);
  });

  it('rejects first row missing Girl First Name', () => {
    const result = validateDCData([{ 'Order Number': '1001' }]);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects first row missing Order Number', () => {
    const result = validateDCData([{ 'Girl First Name': 'Jane' }]);
    expect(result.valid).toBe(false);
  });

  it('only validates first row headers', () => {
    // Second row is malformed but validation should still pass (only checks first row)
    const result = validateDCData([{ 'Girl First Name': 'Jane', 'Order Number': '1001' }, { bad: 'data' }]);
    expect(result.valid).toBe(true);
  });
});
