import { RunnableConfig } from "@langchain/core/runnables";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

export interface CheckpointSaverTestInitializer<T extends BaseCheckpointSaver> {
  /**
   * Called once before any tests are run. Use this to perform any setup that your checkpoint saver may require.
   */
  beforeAll?(): void | Promise<void>;

  /**
   * Called once after all tests are run. Use this to perform any cleanup that your checkpoint saver may require.
   */
  afterAll?(): void | Promise<void>;

  /**
   * Called before each test is run, prior to calling @see createSaver. Use this to modify the @see RunnableConfig that will be used during the test, used to include any additional configuration that your checkpoint saver may require.
   * @param config The @see RunnableConfig that will be used during the test.
   * @returns an instance of @see RunnableConfig (or a promise that resolves to one) to be merged with the original config for use during the test execution.
   */
  configure?(config: RunnableConfig): RunnableConfig | Promise<RunnableConfig>;

  /**
   * Called before each test is run, after @see configure has been called. The checkpoint saver returned will be used during test execution.
   *
   * @param config The @see RunnableConfig that will be used during the test. Can be used for constructing the saver, if required.
   * @returns A new saver, or promise that resolves to a new saver.
   */
  createSaver(config: RunnableConfig): T | Promise<T>;

  /**
   * Called after each test is run. Use this to clean up any resources that your checkpoint saver may have been using.
   * @param saver The @see BaseCheckpointSaver that was used during the test.
   * @param config The @see RunnableConfig that was used during the test.
   */
  destroySaver?(saver: T, config: RunnableConfig): void | Promise<void>;
}
