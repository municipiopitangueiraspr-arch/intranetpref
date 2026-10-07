from flask import Flask, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import json

app = Flask(__name__)
CORS(app)  # Permite requisições do front-end

# Configuração da pasta de atas
PASTA_ATAS = 'atas'

@app.route('/')
def index():
    """Serve a página principal"""
    return send_from_directory('.', 'index.html')

@app.route('/api/atas')
def listar_atas():
    """
    Endpoint principal: Retorna TODOS os JSONs da pasta /atas
    Lê a pasta, filtra apenas .json e retorna o conteúdo de cada um
    """
    atas_encontradas = []
    erros = []

    # Verifica se a pasta existe
    if not os.path.exists(PASTA_ATAS):
        return jsonify({
            'success': False,
            'error': f'Pasta {PASTA_ATAS} não encontrada',
            'atas': []
        })

    # Lista todos os arquivos .json
    arquivos = os.listdir(PASTA_ATAS)
    arquivos_json = [f for f in arquivos if f.lower().endswith('.json')]

    for arquivo in arquivos_json:
        caminho = os.path.join(PASTA_ATAS, arquivo)
        try:
            with open(caminho, 'r', encoding='utf-8') as f:
                conteudo = json.load(f)

                # Adiciona metadados
                conteudo['_filename'] = arquivo
                conteudo['_caminho'] = caminho

                # Validação básica da estrutura
                if 'fornecedor' in conteudo and 'itens' in conteudo:
                    atas_encontradas.append(conteudo)
                else:
                    erros.append({
                        'arquivo': arquivo,
                        'erro': 'Estrutura inválida: campos obrigatórios ausentes'
                    })

        except json.JSONDecodeError:
            erros.append({
                'arquivo': arquivo,
                'erro': 'JSON inválido'
            })
        except Exception as e:
            erros.append({
                'arquivo': arquivo,
                'erro': str(e)
            })

    return jsonify({
        'success': True,
        'total': len(atas_encontradas),
        'atas': atas_encontradas,
        'erros': erros,
        'pasta': PASTA_ATAS
    })

@app.route('/api/ata/<path:filename>')
def obter_ata(filename):
    """Endpoint opcional: Retorna uma ata específica"""
    try:
        caminho = os.path.join(PASTA_ATAS, filename)
        with open(caminho, 'r', encoding='utf-8') as f:
            conteudo = json.load(f)
            conteudo['_filename'] = filename
            return jsonify(conteudo)
    except FileNotFoundError:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'JSON inválido'}), 400

@app.route('/api/stats')
def estatisticas():
    """Endpoint com estatísticas das atas"""
    response = listar_atas().json
    if not response.get('success'):
        return jsonify(response)

    atas = response.get('atas', [])

    # Calcula estatísticas
    total_atas = len(atas)
    total_itens = sum(len(ata.get('itens', [])) for ata in atas)
    fornecedores = set()
    valor_total_geral = 0

    for ata in atas:
        if ata.get('fornecedor', {}).get('cnpj'):
            fornecedores.add(ata['fornecedor']['cnpj'])

        for item in ata.get('itens', []):
            valor_str = item.get('valor_total', '0').replace('.', '').replace(',', '.')
            try:
                valor_total_geral += float(valor_str)
            except:
                pass

    return jsonify({
        'total_atas': total_atas,
        'total_itens': total_itens,
        'total_fornecedores': len(fornecedores),
        'valor_total_geral': f"{valor_total_geral:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.'),
        'arquivos_processados': len(atas),
        'arquivos_com_erro': len(response.get('erros', []))
    })

@app.route('/atas/<path:filename>')
def servir_arquivo_json(filename):
    """Serve arquivos JSON estáticos"""
    return send_from_directory(PASTA_ATAS, filename)

if __name__ == '__main__':
    print("="*50)
    print("🚀 SISTEMA DE GESTÃO DE ATAS DE LICITAÇÃO")
    print("="*50)
    print(f"📁 Pasta de atas: {PASTA_ATAS}/")
    print(f"📊 Endpoint: http://localhost:5000/api/atas")
    print(f"🌐 Interface: http://localhost:5000")
    print("="*50)
    app.run(debug=True, port=5000)