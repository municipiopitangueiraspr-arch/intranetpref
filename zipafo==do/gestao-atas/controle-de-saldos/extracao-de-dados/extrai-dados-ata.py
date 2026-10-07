import os
import json
import re
import pandas as pd
from datetime import datetime
from unicodedata import normalize

# ==================== CONFIGURAÇÃO ====================
pasta_relatorios = os.path.join(os.path.dirname(__file__), "Relatório de Contratações")
output_folder = os.path.join(os.path.dirname(__file__), "atas_extraidas")
os.makedirs(output_folder, exist_ok=True)

if not os.path.isdir(pasta_relatorios):
    print(f"❌ Pasta não encontrada: {pasta_relatorios}")
    exit(1)

csv_files = [f for f in os.listdir(pasta_relatorios) if f.lower().endswith('.csv')]
if not csv_files:
    print(f"❌ Nenhum arquivo .csv encontrado em: {pasta_relatorios}")
    exit(1)

print(f"📁 Encontrados {len(csv_files)} arquivo(s) CSV na pasta:")
for f in csv_files:
    print(f"   - {f}")
print()

# Funções auxiliares
def extrair_fornecedor(fornecedor_str):
    if pd.isna(fornecedor_str):
        return None, None
    cnpj_match = re.search(r'([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}\-[0-9]{2})', fornecedor_str)
    cnpj = cnpj_match.group(1) if cnpj_match else None
    razao = fornecedor_str
    if cnpj:
        razao = razao.replace(cnpj, '').replace('(CNPJ/CPF:)', '').replace('()', '').strip('() ')
    razao = razao.strip()
    return razao, cnpj

def limpar_numero(valor):
    if pd.isna(valor):
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    s = str(valor).strip().replace('.', '').replace(',', '.')
    try:
        return float(s)
    except:
        return None

def normalizar_texto(txt):
    """Remove acentos, caracteres especiais e converte para minúsculas"""
    if not isinstance(txt, str):
        return txt
    # Remove acentos
    txt = normalize('NFKD', txt).encode('ASCII', 'ignore').decode('ASCII')
    # Remove pontuação comum e espaços extras
    txt = re.sub(r'[^\w\s]', '', txt).strip().lower()
    return txt

def ler_csv_flexivel(caminho):
    """Tenta ler CSV com diferentes separadores e encoding, normaliza colunas"""
    separadores = [';', ',']
    encodings = ['latin1', 'cp1252', 'utf-8']
    for sep in separadores:
        for enc in encodings:
            try:
                df = pd.read_csv(caminho, sep=sep, encoding=enc)
                # Limpa nomes das colunas: remove espaços extras, dois pontos, normaliza
                colunas_limpas = {}
                for col in df.columns:
                    col_original = col
                    col = col.strip()
                    if col.endswith(':'):
                        col = col[:-1]
                    col = col.strip()
                    colunas_limpas[col_original] = col
                df.rename(columns=colunas_limpas, inplace=True)

                # Verifica se temos as colunas essenciais (usando normalização)
                col_names_norm = {normalizar_texto(c): c for c in df.columns}
                col_map = {}
                expected = {
                    'contratacao': 'Contratação',
                    'processo': 'Processo',
                    'fornecedor': 'Fornecedor',
                    'item': 'Item',
                    'descricao do material': 'Descrição do material',
                    'qtd contrat': 'Qtd.Contrat.',
                    'vl unitario': 'Vl. Unitário',
                    'vl licit': 'Vl. Licit.'
                }
                for key, target in expected.items():
                    if key in col_names_norm:
                        col_map[col_names_norm[key]] = target
                    else:
                        # Tenta busca flexível
                        for k in col_names_norm:
                            if key in k:
                                col_map[col_names_norm[k]] = target
                                break
                if col_map:
                    df.rename(columns=col_map, inplace=True)
                    # Verifica se as colunas obrigatórias estão presentes
                    required = ['Contratação', 'Processo', 'Fornecedor', 'Item', 'Descrição do material']
                    if all(r in df.columns for r in required):
                        return df
            except Exception:
                continue
    raise ValueError(f"Não foi possível ler o CSV. Colunas originais: {df.columns.tolist() if 'df' in locals() else 'N/A'}")

def processar_csv(caminho_csv):
    print(f"📄 Processando: {os.path.basename(caminho_csv)}")
    df = ler_csv_flexivel(caminho_csv)
    print(f"   Colunas mapeadas: {list(df.columns)}")

    atas = {}
    for idx, row in df.iterrows():
        contrato = row['Contratação']
        if pd.isna(contrato):
            continue
        # Extrai apenas o número da ata (ex: "6/2026")
        contrato_num = contrato.strip().split(' ')[0]
        if contrato_num not in atas:
            razao, cnpj = extrair_fornecedor(row['Fornecedor'])
            atas[contrato_num] = {
                "arquivo_origem": os.path.basename(caminho_csv),
                "data_extracao": datetime.now().isoformat(),
                "numero_processo": row['Processo'],
                "numero_ata": contrato_num,
                "cnpj_fornecedor": cnpj,
                "razao_social": razao,
                "itens": []
            }
        item = {
            "item": str(row['Item']),
            "descricao": row['Descrição do material'] if pd.notna(row['Descrição do material']) else "",
            "quant_contratada": limpar_numero(row['Qtd.Contrat.']),
            "valor_unitario": limpar_numero(row['Vl. Unitário']),
            "valor_total": limpar_numero(row['Vl. Licit.'])
        }
        atas[contrato_num]["itens"].append(item)
    print(f"   ✓ Encontradas {len(atas)} atas neste arquivo.")
    return atas

# Processar cada CSV
total_atas = 0
for csv_file in csv_files:
    caminho_completo = os.path.join(pasta_relatorios, csv_file)
    try:
        atas_extraidas = processar_csv(caminho_completo)
    except Exception as e:
        print(f"   ❌ Erro ao processar {csv_file}: {e}")
        continue

    for num_ata, dados_ata in atas_extraidas.items():
        nome_base = f"Ata_{num_ata.replace('/', '_')}"
        caminho_json = os.path.join(output_folder, f"{nome_base}.json")
        contador = 1
        while os.path.exists(caminho_json):
            caminho_json = os.path.join(output_folder, f"{nome_base}_{contador}.json")
            contador += 1
        with open(caminho_json, 'w', encoding='utf-8') as f:
            json.dump(dados_ata, f, ensure_ascii=False, indent=2)
        print(f"   ✓ Gerado: {os.path.basename(caminho_json)}")
        total_atas += 1

print(f"\n✅ Processamento concluído! Total de atas extraídas: {total_atas}")
print(f"📁 JSONs salvos em: {output_folder}")