// The few helpers from the Dragology repo's src/utils that the demos' logic
// (copied here from its src/demos) uses.

export function assert(
  condition: boolean,
  msg?: string | (() => void),
): asserts condition {
  if (!condition) {
    if (typeof msg === "function") {
      console.group("Assertion failed; debug info:");
      msg();
      console.groupEnd();
      throw new Error("Assertion failed");
    } else {
      throw new Error(msg ?? "Assertion failed");
    }
  }
}

export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function hasKey<K extends string | number | symbol>(
  x: unknown,
  key: K,
): x is Record<K, unknown> {
  return isObject(x) && key in x;
}

/**
 * Make a function that can be called either directly or as a template literal tag
 */
export function templateLiteralTagOrNot<R>(fn: (input: string) => R) {
  function wrapper(s: string): R;
  function wrapper(strings: TemplateStringsArray, ...values: unknown[]): R;
  function wrapper(a: any, ...rest: any[]): R {
    if (typeof a === "string") {
      return fn(a);
    } else {
      // Called as a template literal tag
      let out = a[0];
      for (let i = 0; i < rest.length; i++) {
        out += String(rest[i]) + a[i + 1];
      }
      return fn(out);
    }
  }
  return wrapper;
}
