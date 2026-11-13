import { compareValues } from "../../lib/sort";

export interface ServerOrderRow {
  providerEnvironmentLabel: string;
  name: string;
}

/** Default server table order: environment label, then server name. */
export function compareServerDefault(
  left: ServerOrderRow,
  right: ServerOrderRow,
): number {
  return (
    compareValues(
      left.providerEnvironmentLabel,
      right.providerEnvironmentLabel,
    ) || compareValues(left.name, right.name)
  );
}
