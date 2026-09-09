type UndiciSdk = typeof import('undici');
type UndiciAgent = InstanceType<UndiciSdk['Agent']>;
type AgentOptions = ConstructorParameters<UndiciSdk['Agent']>[0];

export type UndiciRequestInit = import('undici').RequestInit;

let undiciSdkPromise: Promise<UndiciSdk> | null = null;
const agents = new Map<string, UndiciAgent>();

export function loadUndici(): Promise<UndiciSdk> {
  if (!undiciSdkPromise) {
    undiciSdkPromise = import('undici');
  }
  return undiciSdkPromise;
}

export async function getUndiciAgent(name: string, options: AgentOptions): Promise<UndiciAgent> {
  const cached = agents.get(name);
  if (cached) return cached;

  const { Agent } = await loadUndici();
  const agent = new Agent(options);
  agents.set(name, agent);
  return agent;
}

export function createAgentFetch(name: string, options: AgentOptions) {
  return async (input: string, init?: UndiciRequestInit) => {
    const [{ fetch }, dispatcher] = await Promise.all([
      loadUndici(),
      getUndiciAgent(name, options),
    ]);
    return fetch(input, {
      ...init,
      dispatcher: init?.dispatcher ?? dispatcher,
    });
  };
}

export async function undiciFetch(input: string, init?: UndiciRequestInit) {
  const { fetch } = await loadUndici();
  return fetch(input, init);
}
