// Pattern 1: Reimplementing Array.reduce() with a manual for loop
function sumArray(arr: number[]): number {
  if (arr.length === 0) {
    return 0;
  }

  let accumulator = 0;

  for (let i = 0; i < arr.length; i++) {
    const currentValue = arr[i];
    accumulator = accumulator + currentValue;
  }

  return accumulator;
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  const result: Record<string, T[]> = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = keyFn(item);

    if (!result[key]) {
      result[key] = [];
    }

    result[key].push(item);
  }

  return result;
}

function flattenDeep<T>(nested: (T | T[])[]): T[] {
  const result: T[] = [];

  function walk(value: T | T[]) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i]);
      }
    } else {
      result.push(value);
    }
  }

  for (let i = 0; i < nested.length; i++) {
    walk(nested[i]);
  }

  return result;
}
