export type ConnectionInfo = {
  ipAddress: string;
  sshPort: number;
  jumpServerId: number | null;
};

/** True when the change alters how the API connects to the server. */
export function connectionChanged(
  before: ConnectionInfo,
  after: ConnectionInfo,
): boolean {
  return (
    before.ipAddress !== after.ipAddress ||
    before.sshPort !== after.sshPort ||
    before.jumpServerId !== after.jumpServerId
  );
}
