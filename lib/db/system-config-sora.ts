import { getSystemConfigSlice } from './system-config-slice';

export async function getLegacySoraConfig(): Promise<{ soraApiKey: string; soraBaseUrl: string }> {
  return getSystemConfigSlice(
    'legacy-sora',
    'sora_api_key, sora_base_url',
    (row) => ({
      soraApiKey: row?.sora_api_key || '',
      soraBaseUrl: row?.sora_base_url || 'http://localhost:8000',
    })
  );
}

export async function getSoraBackendConfig(): Promise<{ soraBackendUrl: string }> {
  return getSystemConfigSlice(
    'sora-backend',
    'sora_backend_url',
    (row) => ({
      soraBackendUrl: row?.sora_backend_url || '',
    })
  );
}
