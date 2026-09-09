export async function parseJsonResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const rawText = await response.text();
    throw new Error(
      `Invalid response format${rawText ? `: ${rawText.slice(0, 120)}` : ''}`
    );
  }

  return response.json();
}
