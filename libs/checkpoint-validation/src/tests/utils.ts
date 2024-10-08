import { it } from "@jest/globals";

export type SkippedModule = {
  moduleName: string;
  skipReason: string;
};

export function skipOnModules(
  moduleName: string,
  ...modules: SkippedModule[]
): typeof it | typeof it.skip {
  const skippedModule = modules.find(
    (module) => module.moduleName === moduleName
  );

  if (skippedModule) {
    const skip = (
      name: string,
      test: () => void | Promise<void>,
      timeout?: number
    ) => {
      it.skip(`[because ${skippedModule.skipReason}] ${name}`, test);
    };
    skip.prototype = it.skip.prototype;
    return skip as typeof it.skip;
  }

  return it;
}
