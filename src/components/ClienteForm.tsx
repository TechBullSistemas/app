import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ClienteLocalInput } from '@/db/repositories/clientes';
import { ValidaCPFCNPJ } from '@/utils/validaCPFCNPJ';
import { searchCNPJ } from '@/services/searchCNPJ';

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '');
}

function maskCpf(d: string) {
  const v = d.slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
  if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
  return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
}

function maskCnpj(d: string) {
  const v = d.slice(0, 14);
  if (v.length <= 2) return v;
  if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
  if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
  if (v.length <= 12)
    return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(
    8,
    12,
  )}-${v.slice(12)}`;
}

function maskCpfCnpj(raw: string, tipo: 'F' | 'J') {
  const d = onlyDigits(raw);
  if (tipo === 'J') return maskCnpj(d);
  // Pessoa física: aceita até 11 dígitos como CPF; se digitar mais (e o tipo
  // ainda estiver "F"), mostra como CNPJ para ser tolerante.
  if (d.length > 11) return maskCnpj(d);
  return maskCpf(d);
}

function maskCep(raw: string) {
  const d = onlyDigits(raw).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function maskTelefone(raw: string) {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

interface Props {
  initial?: Partial<ClienteLocalInput>;
  onSubmit: (data: ClienteLocalInput) => Promise<void> | void;
  submitLabel?: string;
  saving?: boolean;
}

type Field = keyof ClienteLocalInput;

export function ClienteForm({
  initial,
  onSubmit,
  submitLabel = 'Salvar',
  saving = false,
}: Props) {
  const tpInicial = (initial?.tp_pessoa as 'F' | 'J') ?? 'F';
  const [form, setForm] = useState<ClienteLocalInput>({
    nome: initial?.nome ?? '',
    razao_social: initial?.razao_social ?? null,
    cpf_cnpj: initial?.cpf_cnpj
      ? maskCpfCnpj(initial.cpf_cnpj, tpInicial)
      : null,
    tp_pessoa: tpInicial,
    fone: initial?.fone ? maskTelefone(initial.fone) : null,
    celular: initial?.celular ? maskTelefone(initial.celular) : null,
    email: initial?.email ?? null,
    endereco: initial?.endereco ?? null,
    numero: initial?.numero ?? null,
    bairro: initial?.bairro ?? null,
    cd_cidade: initial?.cd_cidade ?? null,
    cep: initial?.cep ? maskCep(initial.cep) : null,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [cpfCnpjErro, setCpfCnpjErro] = useState<string | null>(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function set<K extends Field>(key: K, value: ClienteLocalInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setTipoPessoa(tp: 'F' | 'J') {
    setForm((prev) => ({
      ...prev,
      tp_pessoa: tp,
      cpf_cnpj: prev.cpf_cnpj ? maskCpfCnpj(prev.cpf_cnpj, tp) : prev.cpf_cnpj,
    }));
    setCpfCnpjErro(null);
  }

  function setCpfCnpj(raw: string) {
    const tp = (form.tp_pessoa as 'F' | 'J') ?? 'F';
    const masked = maskCpfCnpj(raw, tp);
    set('cpf_cnpj', masked);
    setCpfCnpjErro(null);
    setAviso(null);

    const d = onlyDigits(masked);
    // Quando o usuário completa o documento, valida e — para CNPJ — busca dados
    if (tp === 'F' && d.length === 11) {
      if (!ValidaCPFCNPJ(d)) {
        setCpfCnpjErro('CPF inválido.');
      }
    } else if (tp === 'J' && d.length === 14) {
      if (!ValidaCPFCNPJ(d)) {
        setCpfCnpjErro('CNPJ inválido.');
      } else {
        void buscarDadosCnpj(d);
      }
    }
  }

  async function buscarDadosCnpj(cnpjDigits: string) {
    setBuscandoCnpj(true);
    setAviso(null);
    try {
      const res = await searchCNPJ(cnpjDigits);
      if (!res) {
        setAviso('Não foi possível obter dados do CNPJ.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        nome: prev.nome?.trim()
          ? prev.nome
          : res.nomeFantasia || res.razaoSocial || prev.nome,
        razao_social: prev.razao_social?.trim()
          ? prev.razao_social
          : res.razaoSocial || prev.razao_social,
        email: prev.email?.trim() ? prev.email : res.email || prev.email,
        fone: prev.fone?.trim()
          ? prev.fone
          : res.telefone
          ? maskTelefone(res.telefone)
          : prev.fone,
        cep: prev.cep?.trim() ? prev.cep : res.cep ? maskCep(res.cep) : prev.cep,
        endereco: prev.endereco?.trim()
          ? prev.endereco
          : res.endereco || prev.endereco,
        numero: prev.numero?.trim() ? prev.numero : res.numero || prev.numero,
        bairro: prev.bairro?.trim() ? prev.bairro : res.bairro || prev.bairro,
      }));
      setAviso('Dados preenchidos a partir do CNPJ.');
    } catch {
      setAviso('Falha ao consultar o CNPJ.');
    } finally {
      setBuscandoCnpj(false);
    }
  }

  async function handleSubmit() {
    if (!form.nome?.trim()) {
      setErro('Nome é obrigatório.');
      return;
    }
    const tp = (form.tp_pessoa as 'F' | 'J') ?? 'F';
    const docDigits = form.cpf_cnpj ? onlyDigits(form.cpf_cnpj) : '';
    if (docDigits) {
      if (tp === 'F' && docDigits.length !== 11) {
        setErro('CPF deve ter 11 dígitos.');
        return;
      }
      if (tp === 'J' && docDigits.length !== 14) {
        setErro('CNPJ deve ter 14 dígitos.');
        return;
      }
      if (!ValidaCPFCNPJ(docDigits)) {
        setErro(tp === 'F' ? 'CPF inválido.' : 'CNPJ inválido.');
        return;
      }
    }
    setErro(null);
    await onSubmit({
      ...form,
      nome: form.nome.trim(),
      razao_social: form.razao_social?.trim() || null,
      cpf_cnpj: docDigits || null,
      fone: form.fone ? onlyDigits(form.fone) || null : null,
      celular: form.celular ? onlyDigits(form.celular) || null : null,
      email: form.email?.trim() || null,
      endereco: form.endereco?.trim() || null,
      numero: form.numero?.trim() || null,
      bairro: form.bairro?.trim() || null,
      cep: form.cep ? onlyDigits(form.cep) || null : null,
    });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <Pressable
          style={[styles.tipoBtn, form.tp_pessoa === 'F' && styles.tipoBtnActive]}
          onPress={() => setTipoPessoa('F')}
        >
          <Text
            style={[
              styles.tipoBtnText,
              form.tp_pessoa === 'F' && styles.tipoBtnTextActive,
            ]}
          >
            Pessoa Física
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tipoBtn, form.tp_pessoa === 'J' && styles.tipoBtnActive]}
          onPress={() => setTipoPessoa('J')}
        >
          <Text
            style={[
              styles.tipoBtnText,
              form.tp_pessoa === 'J' && styles.tipoBtnTextActive,
            ]}
          >
            Pessoa Jurídica
          </Text>
        </Pressable>
      </View>

      <Campo
        label={form.tp_pessoa === 'J' ? 'Nome fantasia *' : 'Nome *'}
        value={form.nome ?? ''}
        onChangeText={(t) => set('nome', t)}
        autoCapitalize="words"
      />

      {form.tp_pessoa === 'J' ? (
        <Campo
          label="Razão social"
          value={form.razao_social ?? ''}
          onChangeText={(t) => set('razao_social', t)}
          autoCapitalize="words"
        />
      ) : null}

      <View>
        <View style={styles.cpfHeader}>
          <Text style={styles.label}>
            {form.tp_pessoa === 'J' ? 'CNPJ' : 'CPF'}
          </Text>
          {buscandoCnpj ? (
            <View style={styles.cpfBuscando}>
              <ActivityIndicator size="small" color="#1e3a8a" />
              <Text style={styles.cpfBuscandoTexto}>buscando dados…</Text>
            </View>
          ) : null}
        </View>
        <TextInput
          style={[
            styles.input,
            cpfCnpjErro ? { borderColor: '#dc2626' } : null,
          ]}
          value={form.cpf_cnpj ?? ''}
          onChangeText={setCpfCnpj}
          keyboardType="numeric"
          maxLength={form.tp_pessoa === 'J' ? 18 : 14}
        />
        {cpfCnpjErro ? (
          <Text style={styles.fieldError}>{cpfCnpjErro}</Text>
        ) : null}
        {!cpfCnpjErro && aviso ? (
          <View style={styles.avisoBox}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color="#0369a1"
            />
            <Text style={styles.avisoTexto}>{aviso}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Campo
            label="Telefone"
            value={form.fone ?? ''}
            onChangeText={(t) => set('fone', maskTelefone(t))}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Campo
            label="Celular"
            value={form.celular ?? ''}
            onChangeText={(t) => set('celular', maskTelefone(t))}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>
      </View>

      <Campo
        label="E-mail"
        value={form.email ?? ''}
        onChangeText={(t) => set('email', t)}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <View style={styles.row}>
        <View style={{ flex: 3 }}>
          <Campo
            label="Endereço"
            value={form.endereco ?? ''}
            onChangeText={(t) => set('endereco', t)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Campo
            label="Número"
            value={form.numero ?? ''}
            onChangeText={(t) => set('numero', t)}
          />
        </View>
      </View>

      <Campo
        label="Bairro"
        value={form.bairro ?? ''}
        onChangeText={(t) => set('bairro', t)}
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Campo
            label="CEP"
            value={form.cep ?? ''}
            onChangeText={(t) => set('cep', maskCep(t))}
            keyboardType="numeric"
            maxLength={9}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Campo
            label="Cód. Cidade"
            value={form.cd_cidade != null ? String(form.cd_cidade) : ''}
            onChangeText={(t) => {
              const n = Number(t.replace(/\D/g, ''));
              set('cd_cidade', Number.isFinite(n) && n > 0 ? n : null);
            }}
            keyboardType="numeric"
          />
        </View>
      </View>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <Pressable
        style={[styles.submitBtn, saving && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={saving}
      >
        <Text style={styles.submitBtnText}>
          {saving ? 'Salvando...' : submitLabel}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

interface CampoProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  maxLength?: number;
}

function Campo({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  maxLength,
}: CampoProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  row: { flexDirection: 'row', gap: 8 },
  label: { color: '#334155', fontWeight: '600', marginBottom: 4, fontSize: 13 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  tipoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tipoBtnActive: { backgroundColor: '#1e3a8a', borderColor: '#1e3a8a' },
  tipoBtnText: { color: '#334155', fontWeight: '600' },
  tipoBtnTextActive: { color: '#fff' },
  submitBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  erro: { color: '#dc2626', fontWeight: '600' },
  cpfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cpfBuscando: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cpfBuscandoTexto: { color: '#1e3a8a', fontSize: 11, fontWeight: '600' },
  fieldError: { color: '#dc2626', fontSize: 12, marginTop: 4 },
  avisoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  avisoTexto: { color: '#0369a1', fontSize: 12, fontWeight: '600' },
});
