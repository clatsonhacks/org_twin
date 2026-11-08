import { runOrgTwinMigrations } from "../db/migrations.js";

export default async (nitroApp: any): Promise<void> => {
  await runOrgTwinMigrations(nitroApp);
};
