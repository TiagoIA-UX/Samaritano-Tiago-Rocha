/**
 * kerneo_help.js — Mostra capacidades do Kerneo categorizadas + exemplos práticos.
 *
 * Use quando user pedir:
 *   - "ajuda", "help", "o que sabe fazer"
 *   - "como te uso?"
 *   - "tutorial"
 *   - "exemplos"
 */

let _registry = null
export function setRegistry(reg) { _registry = reg }

export const definition = {
  name: 'kerneo_help',
  description: 'Mostra ajuda organizada com exemplos práticos do que o Kerneo sabe fazer. Use quando user pedir "ajuda", "help", "o que sabe fazer", "tutorial", "exemplos", "me ensina a usar".',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        enum: ['all', 'apps', 'sites', 'pesquisa', 'memoria', 'voz', 'auto-evolucao'],
        default: 'all',
        description: 'Categoria específica. "all" mostra resumo geral.',
      },
    },
  },
}

const HELP_CATEGORIES = {
  apps: {
    title: '🖥️  Apps nativos do PC',
    desc: 'Abre programas instalados no Windows/Mac/Linux',
    examples: [
      'abre a calculadora',
      'abre o bloco de notas',
      'abre o paint',
      'abre o vscode',
      'abre as configurações',
      'abre o gerenciador de tarefas',
      'abre o spotify',
      'abre o discord',
    ],
  },
  sites: {
    title: '🌐 Sites web',
    desc: 'Abre sites no navegador (com tua sessão)',
    examples: [
      'abre o youtube',
      'abre meu gmail',
      'abre o github',
      'abre o ifood',
      'abre o instagram',
    ],
  },
  pesquisa: {
    title: '🔍 Pesquisa',
    desc: 'Busca em sites específicos OU resposta sintetizada',
    examples: [
      'pesquisa pizza no google',
      'busca tenis nike no mercado livre',
      'acha receita de bolo no youtube',
      'preço do bitcoin hoje',
      'quem é o presidente do Brasil',
      'qual a temperatura agora',
    ],
  },
  memoria: {
    title: '🧠 Memória persistente',
    desc: 'Salva e busca informações sobre você (entre sessões)',
    examples: [
      'salva: meu cep é 01310-100',
      'salva: meu trabalho é programador',
      'lembra meu cep',
      'o que você sabe sobre mim',
    ],
  },
  voz: {
    title: '🎙️  Voz',
    desc: 'Fala com o Kerneo (Web Speech ou Whisper)',
    examples: [
      'Segura a barra de espaço pra falar',
      'Solta pra enviar — Kerneo responde com voz',
      'Funciona melhor no Chrome/Edge',
    ],
  },
  'auto-evolucao': {
    title: '✨ Auto-evolução (DIFERENCIAL!)',
    desc: 'Kerneo cria suas próprias skills sob demanda',
    examples: [
      'cria uma skill que tira screenshot',
      'cria uma skill que controla o volume',
      'cria uma skill que abre meus arquivos favoritos',
      'instala uma tool pra fechar todas as janelas',
      'quais skills você tem?',
      'remove a skill X',
    ],
  },
}

export async function execute({ topic = 'all' } = {}) {
  if (topic === 'all') {
    const sections = Object.values(HELP_CATEGORIES).map(cat => {
      const examples = cat.examples.slice(0, 3).map(e => `   • "${e}"`).join('\n')
      return `${cat.title}\n${examples}`
    }).join('\n\n')

    const userToolCount = _registry
      ? (_registry.listFull?.() || []).filter(t => t.isUserCreated).length
      : 0
    const totalCount = _registry ? _registry.list().length : '?'

    return {
      ok: true,
      topic: 'all',
      total_skills: totalCount,
      user_created_skills: userToolCount,
      message:
`O que eu sei fazer (${totalCount} skills${userToolCount > 0 ? `, ${userToolCount} criadas por você ✨` : ''}):

${sections}

Pra ver detalhes de uma categoria, peça:
  • "ajuda apps" / "ajuda sites" / "ajuda pesquisa" / "ajuda memoria" / "ajuda voz" / "ajuda auto-evolucao"

⚡ DIFERENCIAL: você pode pedir QUALQUER capacidade — se eu não tenho, eu CRIO uma skill na hora.
   Tente: "cria uma skill que faz X"`,
    }
  }

  const cat = HELP_CATEGORIES[topic]
  if (!cat) {
    return {
      ok: false,
      error: `Tópico desconhecido: ${topic}`,
      valid: Object.keys(HELP_CATEGORIES),
    }
  }

  return {
    ok: true,
    topic,
    title: cat.title,
    description: cat.desc,
    examples: cat.examples,
    message: `${cat.title}\n${cat.desc}\n\nExemplos:\n${cat.examples.map(e => `  • "${e}"`).join('\n')}`,
  }
}

export { HELP_CATEGORIES }
