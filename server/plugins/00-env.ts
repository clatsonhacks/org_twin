import { applyVultrEnvAliases } from "../env-aliases.js";

// Runs before the agent-chat plugin (plugins load in file-name order).
export default (): void => {
  applyVultrEnvAliases();
};
