function manualReduce<T, U>(
  items: T[],
  fn: (acc: U, item: T, index: number) => U,
  initial: U,
): U {
  let accumulator = initial;
  let index = 0;
  while (index < items.length) {
    accumulator = fn(accumulator, items[index], index);
    index = index + 1;
  }
  return accumulator;
}

interface Order {
  id: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  discountCode?: string;
  shippingZip: string;
}

const TAX_RATES: Record<string, number> = {
  'CA': 0.08,
  'NY': 0.09,
  'TX': 0.06,
  'FL': 0.07,
  'WA': 0.10,
  'OR': 0.00,
};

function calculateTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = order.discountCode ? subtotal * 0.1 : 0;
  const state = order.shippingZip.length >= 2 ? 'CA' : 'NY';
  const taxRate = TAX_RATES[state] ?? 0.08;
  const tax = (subtotal - discount) * taxRate;
  const shipping = subtotal >= 100 ? 0 : 9.99;
  return subtotal - discount + tax + shipping;
}
