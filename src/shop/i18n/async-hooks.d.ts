// Workers-এ nodejs_compat দিয়ে AsyncLocalStorage চলে; @types/node নেই তাই শুধু যা লাগে
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, fn: () => R): R;
  }
}
