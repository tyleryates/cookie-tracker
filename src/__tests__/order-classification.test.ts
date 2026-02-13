import { describe, expect, it } from 'vitest';
import { classifyOrderStatus, isDCAutoSync } from '../order-classification';

describe('classifyOrderStatus', () => {
  it('returns NEEDS_APPROVAL for needs approval status', () => {
    expect(classifyOrderStatus('Needs Approval')).toBe('NEEDS_APPROVAL');
  });

  it('returns COMPLETED for Status Delivered', () => {
    expect(classifyOrderStatus('Status Delivered')).toBe('COMPLETED');
  });

  it('returns COMPLETED for Completed', () => {
    expect(classifyOrderStatus('Completed')).toBe('COMPLETED');
  });

  it('returns COMPLETED for Delivered', () => {
    expect(classifyOrderStatus('Delivered')).toBe('COMPLETED');
  });

  it('returns COMPLETED for Shipped', () => {
    expect(classifyOrderStatus('Shipped')).toBe('COMPLETED');
  });

  it('returns PENDING for Pending', () => {
    expect(classifyOrderStatus('Pending')).toBe('PENDING');
  });

  it('returns PENDING for Approved for Delivery', () => {
    expect(classifyOrderStatus('Approved for Delivery')).toBe('PENDING');
  });

  it('returns UNKNOWN for empty string', () => {
    expect(classifyOrderStatus('')).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined', () => {
    expect(classifyOrderStatus(undefined)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for unrecognized status', () => {
    expect(classifyOrderStatus('Cancelled')).toBe('UNKNOWN');
  });

  it('handles substring matching (e.g. "Order Completed")', () => {
    expect(classifyOrderStatus('Order Completed')).toBe('COMPLETED');
  });

  it('Needs Approval takes priority over Delivered in compound status', () => {
    expect(classifyOrderStatus('Needs Approval - Delivered')).toBe('NEEDS_APPROVAL');
  });
});

describe('isDCAutoSync', () => {
  it('auto-syncs Shipped + CAPTURED', () => {
    expect(isDCAutoSync('Shipped to Customer', 'CAPTURED')).toBe(true);
  });

  it('auto-syncs Donation + CAPTURED', () => {
    expect(isDCAutoSync('Donation', 'CAPTURED')).toBe(true);
  });

  it('does not auto-sync In-Person Delivery + CAPTURED', () => {
    expect(isDCAutoSync('In-Person Delivery', 'CAPTURED')).toBe(false);
  });

  it('does not auto-sync Shipped + CASH', () => {
    expect(isDCAutoSync('Shipped to Customer', 'CASH')).toBe(false);
  });

  it('does not auto-sync Shipped + AUTHORIZED', () => {
    expect(isDCAutoSync('Shipped to Customer', 'AUTHORIZED')).toBe(false);
  });

  it('does not auto-sync In-Person Delivery + CASH', () => {
    expect(isDCAutoSync('In-Person Delivery', 'CASH')).toBe(false);
  });

  it('Donation must be exact match (not includes)', () => {
    // "Donation" is an exact match check, not includes
    expect(isDCAutoSync('Donation Extra', 'CAPTURED')).toBe(false);
  });

  it('Shipped uses includes (substring match)', () => {
    expect(isDCAutoSync('Girl Scout Shipped Order', 'CAPTURED')).toBe(true);
  });
});
