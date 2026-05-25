export function shouldRefreshCloudOnUserSwitch(
  isAdminUser: boolean,
  currentUserName: string,
  nextUserName: string
): boolean {
  return isAdminUser && currentUserName !== nextUserName
}
