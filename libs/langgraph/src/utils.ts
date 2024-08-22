import { CallbackManagerForChainRun } from "@langchain/core/callbacks/manager";
import {
  mergeConfigs,
  patchConfig,
  Runnable,
  RunnableConfig,
} from "@langchain/core/runnables";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RunnableCallableArgs extends Partial<any> {
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (...args: any[]) => any;
  tags?: string[];
  trace?: boolean;
  recurse?: boolean;
}

export class RunnableCallable<I = unknown, O = unknown> extends Runnable<I, O> {
  lc_namespace: string[] = ["langgraph"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (...args: any[]) => any;

  tags?: string[];

  config?: RunnableConfig;

  trace: boolean = true;

  recurse: boolean = true;

  constructor(fields: RunnableCallableArgs) {
    super();
    this.name = fields.name ?? fields.func.name;
    this.func = fields.func;
    this.config = fields.tags ? { tags: fields.tags } : undefined;
    this.trace = fields.trace ?? this.trace;
    this.recurse = fields.recurse ?? this.recurse;
  }

  protected async _tracedInvoke(
    input: I,
    config?: Partial<RunnableConfig>,
    runManager?: CallbackManagerForChainRun
  ) {
    return new Promise<O>((resolve, reject) => {
      const childConfig = patchConfig(config, {
        callbacks: runManager?.getChild(),
      });
      void AsyncLocalStorageProviderSingleton.runWithConfig(
        childConfig,
        async () => {
          try {
            const output = await this.func(input, childConfig);
            resolve(output);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  async invoke(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    options?: Partial<RunnableConfig> | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let returnValue: any;

    if (this.trace) {
      returnValue = await this._callWithConfig(
        this._tracedInvoke,
        input,
        mergeConfigs(this.config, options)
      );
    } else {
      returnValue = await this.func(input, mergeConfigs(this.config, options));
    }

    if (Runnable.isRunnable(returnValue) && this.recurse) {
      return await returnValue.invoke(input, options);
    }

    return returnValue;
  }
}

export function prefixGenerator<T, Prefix extends string>(
  generator: Generator<T>,
  prefix: Prefix
): Generator<[Prefix, T]>;
export function prefixGenerator<T>(
  generator: Generator<T>,
  prefix?: undefined
): Generator<T>;
export function prefixGenerator<
  T,
  Prefix extends string | undefined = undefined
>(
  generator: Generator<T>,
  prefix?: Prefix | undefined
): Generator<Prefix extends string ? [Prefix, T] : T>;
export function* prefixGenerator<
  T,
  Prefix extends string | undefined = undefined
>(
  generator: Generator<T>,
  prefix?: Prefix | undefined
): Generator<Prefix extends string ? [Prefix, T] : T> {
  if (prefix === undefined) {
    yield* generator as Generator<Prefix extends string ? [Prefix, T] : T>;
  } else {
    for (const value of generator) {
      yield [prefix, value] as Prefix extends string ? [Prefix, T] : T;
    }
  }
}

// https://github.com/tc39/proposal-array-from-async
export async function gatherIterator<T>(
  i:
    | AsyncIterable<T>
    | Promise<AsyncIterable<T>>
    | Iterable<T>
    | Promise<Iterable<T>>
): Promise<Array<T>> {
  const out: T[] = [];
  for await (const item of await i) {
    out.push(item);
  }
  return out;
}