'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Btn, Card, Carregando, Input, PageTitle, Tabela, Td, TextArea, Th, toast,
} from '@/components/ui';
import { fmtMoeda } from '@/lib/utils';
import type { Revendedor } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

type Faixa = { de: string; ate: string; valor: string };

const FAIXA_VAZIA: Faixa = { de: '', ate: '', valor: '' };

export default function RegrasPlanosPage() {
  const supabase = useMemo(() => createClient(), []);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [textoRegras, setTextoRegras] = useState('');
  const [faixasIndicacao, setFaixasIndicacao] = useState<Faixa[]>([]);
  const [faixasRevenda, setFaixasRevenda] = useState<Faixa[]>([]);

  const [revendedores, setRevendedores] = useState<Revendedor[]>([]);
  const [indicadores, setIndicadores] = useState<Revendedor[]>([]);

  async function carregar() {
    setCarregando(true);
    const [cfg, rev] = await Promise.all([
      supabase.from('settings').select('valor').eq('chave', 'regras_planos').maybeSingle(),
      supabase.from('revendedores').select('*').eq('ativo', true).order('nome'),
    ]);
    const valor = cfg.data?.valor as { texto_regras?: string; faixas_indicacao?: Faixa[]; faixas_revenda?: Faixa[] } | undefined;
    setTextoRegras(valor?.texto_regras ?? '');
    setFaixasIndicacao(valor?.faixas_indicacao?.length ? valor.faixas_indicacao : []);
    setFaixasRevenda(valor?.faixas_revenda?.length ? valor.faixas_revenda : []);
    const todos = (rev.data as Revendedor[]) ?? [];
    setRevendedores(todos.filter((r) => r.tipo === 'master'));
    setIndicadores(todos.filter((r) => r.tipo === 'indicacao'));
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from('settings').upsert({
      chave: 'regras_planos',
      valor: { texto_regras: textoRegras, faixas_indicacao: faixasIndicacao, faixas_revenda: faixasRevenda },
      atualizado_em: new Date().toISOString(),
    });
    setSalvando(false);
    if (error) return toast(`Erro ao salvar: ${error.message}`, 'erro');
    toast('Regras e planos salvos.');
  }

  return (
    <div>
      <PageTitle title="Regras e planos" subtitle="Referência de comissões e valores para negociar com indicadores e revendedores" />

      {carregando ? (
        <Carregando />
      ) : (
        <div className="space-y-5">
          <Card title="Regras gerais (texto livre)">
            <TextArea
              rows={6}
              value={textoRegras}
              onChange={(e) => setTextoRegras(e.target.value)}
              placeholder="Ex.: Revendedor precisa ter no mínimo 10 acessos ativos para taxa reduzida. Indicador vira revendedor master a partir de 15 indicados ativos..."
            />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Faixas sugeridas — comissão de Indicação">
              <TabelaFaixas
                faixas={faixasIndicacao}
                setFaixas={setFaixasIndicacao}
                rotuloFaixa="clientes indicados"
                rotuloValor="Comissão (R$)"
              />
            </Card>
            <Card title="Faixas sugeridas — valor por acesso (Revenda)">
              <TabelaFaixas
                faixas={faixasRevenda}
                setFaixas={setFaixasRevenda}
                rotuloFaixa="acessos ativos"
                rotuloValor="Valor por acesso (R$)"
              />
            </Card>
          </div>
          <p className="text-xs text-slate-400 -mt-3">
            Essas faixas são só uma referência para você decidir a taxa na hora de negociar — aplique o valor
            manualmente no cadastro do revendedor/indicador em Revendas. Elas não mudam a comissão de ninguém
            sozinhas.
          </p>

          <Btn onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar regras e planos'}</Btn>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
            <Card title={`Revendedores master atuais (${revendedores.length})`}>
              {revendedores.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum revendedor master ativo.</p>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Nome</Th>
                      <Th>Valor/acesso</Th>
                      <Th>Qtd. acessos</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {revendedores.map((r) => (
                      <tr key={r.id}>
                        <Td>{r.nome}</Td>
                        <Td>{fmtMoeda(r.valor_por_acesso)}</Td>
                        <Td>{r.quantidade_clientes}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </Card>
            <Card title={`Indicadores atuais (${indicadores.length})`}>
              {indicadores.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum indicador ativo.</p>
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Nome</Th>
                      <Th>Comissão</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadores.map((r) => (
                      <tr key={r.id}>
                        <Td>{r.nome}</Td>
                        <Td>{r.comissao_tipo === 'percentual' ? `${r.comissao_valor}%` : fmtMoeda(r.comissao_valor)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function TabelaFaixas({
  faixas, setFaixas, rotuloFaixa, rotuloValor,
}: {
  faixas: Faixa[];
  setFaixas: (f: Faixa[]) => void;
  rotuloFaixa: string;
  rotuloValor: string;
}) {
  function atualizar(i: number, campo: keyof Faixa, valor: string) {
    const novas = [...faixas];
    novas[i] = { ...novas[i], [campo]: valor };
    setFaixas(novas);
  }
  function remover(i: number) {
    setFaixas(faixas.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      {faixas.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <Input label={i === 0 ? `De (${rotuloFaixa})` : undefined} type="number" value={f.de} onChange={(e) => atualizar(i, 'de', e.target.value)} />
          <Input label={i === 0 ? `Até (${rotuloFaixa})` : undefined} type="number" value={f.ate} onChange={(e) => atualizar(i, 'ate', e.target.value)} />
          <Input label={i === 0 ? rotuloValor : undefined} type="number" step="0.01" value={f.valor} onChange={(e) => atualizar(i, 'valor', e.target.value)} />
          <button type="button" onClick={() => remover(i)} className="p-2 text-slate-400 hover:text-rose-600" title="Remover faixa">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <Btn type="button" size="sm" variant="secondary" onClick={() => setFaixas([...faixas, { ...FAIXA_VAZIA }])}>
        <Plus size={14} /> Adicionar faixa
      </Btn>
    </div>
  );
}
