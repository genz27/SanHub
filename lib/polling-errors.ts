export function getFriendlyErrorMessage(errMsg: string): string {
  const lowerMsg = errMsg.toLowerCase();
  if (
    lowerMsg.includes('generation process begins') ||
    lowerMsg.includes('missing video payload') ||
    lowerMsg.includes('missing image payload')
  ) {
    return 'Server timeout. Please try again later.';
  }
  if (
    lowerMsg.includes('heavy_load') ||
    lowerMsg.includes('heavy load') ||
    lowerMsg.includes('try again later')
  ) {
    return 'Server is busy. Please try again later.';
  }
  if (lowerMsg.includes('status: 400') || lowerMsg.includes('request failed: 400')) {
    return 'Request failed. Please retry.';
  }
  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('socket') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('connection')
  ) {
    return 'Network error. Please check your connection.';
  }
  return errMsg;
}
