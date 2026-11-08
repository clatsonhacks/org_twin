import { registerConnectorSecrets } from "../connectors/registry.js";

export default (): void => {
  registerConnectorSecrets();
};
