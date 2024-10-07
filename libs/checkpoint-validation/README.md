# @langchain/langgraph-validation

This library is used to validate LangGraph checkpoint saver implementations. It contains a suite of validation tests that can target arbitrary extensions of the `BaseCheckpointSaver` class defined in `@langchain/langgraph-checkpoint`.

## CLI usage

```bash
yarn @langchain/langgraph-validation --checkpoint-saver|-s <import-path-of-checkpoint-saver> [--initializer|-i <import-path-of-initializer>]
```

The CLI expects that the checkpoint saver and initializer are default exports of the module names passed.

## Library usage

```ts
import { validate } from "@langchain/langgraph-validation";

validate(MyCheckpointSaver, MyCheckpointSaverInitializer);
```
