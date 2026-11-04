export const ORDER_STATUSES = [
  'PENDING',
  'PAID',
  'PAYMENT_FAILED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PENDING', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(
  currentStatus: string,
  nextStatus: string,
): asserts nextStatus is OrderStatus {
  if (
    !ORDER_STATUSES.includes(currentStatus as OrderStatus) ||
    !ORDER_STATUSES.includes(nextStatus as OrderStatus)
  ) {
    throw new Error('Trạng thái đơn hàng không hợp lệ.');
  }

  const allowedStatuses = ALLOWED_TRANSITIONS[currentStatus as OrderStatus];

  if (!allowedStatuses.includes(nextStatus as OrderStatus)) {
    throw new Error(
      `Không thể chuyển trạng thái đơn hàng từ ${currentStatus} sang ${nextStatus}.`,
    );
  }
}