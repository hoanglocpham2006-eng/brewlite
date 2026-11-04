import {
  assertTransition,
  ORDER_STATUSES,
} from './order-state-machine';

describe('Order State Machine', () => {
  it('cho phép chuyển PENDING sang PAID', () => {
    expect(() => assertTransition('PENDING', 'PAID')).not.toThrow();
  });

  it('cho phép chuyển PENDING sang PAYMENT_FAILED', () => {
    expect(() =>
      assertTransition('PENDING', 'PAYMENT_FAILED'),
    ).not.toThrow();
  });

  it('cho phép thử lại sau PAYMENT_FAILED', () => {
    expect(() =>
      assertTransition('PAYMENT_FAILED', 'PENDING'),
    ).not.toThrow();
  });

  it('chặn chuyển PENDING thẳng sang COMPLETED', () => {
    expect(() =>
      assertTransition('PENDING', 'COMPLETED'),
    ).toThrow(Error);
  });

  it('chặn chuyển PREPARING thẳng sang COMPLETED', () => {
    expect(() =>
      assertTransition('PREPARING', 'COMPLETED'),
    ).toThrow(Error);
  });

  it('không cho phép chuyển tiếp từ COMPLETED', () => {
    expect(() =>
      assertTransition('COMPLETED', 'CANCELLED'),
    ).toThrow(Error);
  });

  it('không cho phép chuyển tiếp từ CANCELLED', () => {
    expect(() =>
      assertTransition('CANCELLED', 'PENDING'),
    ).toThrow(Error);
  });

  it('từ chối trạng thái không được hỗ trợ', () => {
    expect(() =>
      assertTransition('UNKNOWN', 'PAID'),
    ).toThrow(Error);
  });

  it('khai báo đủ các trạng thái cần thiết', () => {
    expect(ORDER_STATUSES).toContain('PENDING');
    expect(ORDER_STATUSES).toContain('PAID');
    expect(ORDER_STATUSES).toContain('PAYMENT_FAILED');
    expect(ORDER_STATUSES).toContain('PREPARING');
    expect(ORDER_STATUSES).toContain('READY');
    expect(ORDER_STATUSES).toContain('COMPLETED');
    expect(ORDER_STATUSES).toContain('CANCELLED');
  });
});