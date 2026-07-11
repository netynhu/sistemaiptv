// Helpers de configurações (somente servidor)
import { createAdminClient } from '@/lib/supabase/server';

export async function getSetting<T>(chave: string): Promise<T | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('settings')
    .select('valor')
    .eq('chave', chave)
    .maybeSingle();
  if (error) throw new Error(`Erro ao ler configuração "${chave}": ${error.message}`);
  return (data?.valor as T) ?? null;
}

export async function setSetting(chave: string, valor: unknown): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('settings')
    .upsert({ chave, valor, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(`Erro ao salvar configuração "${chave}": ${error.message}`);
}
