export function withModuleContext(error, moduleId) {
  if (moduleId === null || moduleId === undefined || error?.moduleId !== undefined) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const contextual = new Error(`Module "${moduleId}": ${message}`, { cause: error });
  contextual.moduleId = moduleId;
  return contextual;
}
