export function mergeSharedCloudOverrides<T extends Record<string, unknown>>(
  _localOverrides: T,
  cloudOverrides: T
): T {
  return cloudOverrides
}

export function shouldRefreshCloudOnUserSwitch(
  isAdminUser: boolean,
  currentUserName: string,
  nextUserName: string
): boolean {
  return isAdminUser && currentUserName !== nextUserName
}
