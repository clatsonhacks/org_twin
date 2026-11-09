import { registerSigninSecrets } from "../connectors/oauth.js";
import { registerConnectorSecrets } from "../connectors/registry.js";

export default (): void => {
  registerConnectorSecrets();
  registerSigninSecrets();
};
