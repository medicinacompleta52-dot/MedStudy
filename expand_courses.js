import fs from "node:fs";

const rawCourses = JSON.parse(fs.readFileSync("courses.json", "utf8"));

const videoUrls = [
  "/api/stream/sample.mp4"
];

function getVideoUrl(_idx) {
  return "/api/stream/sample.mp4";
}

const standardModulesTemplate = [
  {
    title: "Módulo 01 — Cardiologia Clínica & Arritmias",
    description: "Síndromes coronarianas agudas, arritmias complexas, eletrocardiograma e insuficiência cardíaca.",
    lessons: [
      { title: "Aula 01 - Síndrome Coronariana Aguda com e sem Supra de ST", duration: "52 min" },
      { title: "Aula 02 - Eletrocardiograma de Urgência & Arritmias Frequentes", duration: "48 min" },
      { title: "Aula 03 - Insuficiência Cardíaca: Diagnóstico, Fração de Ejeção e Manejo", duration: "56 min" },
      { title: "Aula 04 - Hipertensão Arterial Sistêmica, Refratária e Emergências Hipertensivas", duration: "44 min" }
    ]
  },
  {
    title: "Módulo 02 — Pneumologia & Doenças Respiratórias",
    description: "Manejo da asma, DPOC, pneumonias comunitárias e tromboembolismo pulmonar.",
    lessons: [
      { title: "Aula 05 - Asma Brônquica: Crise Aguda e Tratamento de Manutenção (GINA)", duration: "50 min" },
      { title: "Aula 06 - DPOC Descompensada e Manejo Ambulatorial (GOLD)", duration: "46 min" },
      { title: "Aula 07 - Pneumonias Adquiridas na Comunidade (PAC) & Estratificação de Risco", duration: "54 min" },
      { title: "Aula 08 - Tromboembolismo Pulmonar Agudo (TEP) & Anticoagulação", duration: "49 min" }
    ]
  },
  {
    title: "Módulo 03 — Nefrologia & Distúrbios Hidroeletrolíticos",
    description: "Injúria renal aguda, glomerulopatias, distúrbios de sódio e potássio e ácido-base.",
    lessons: [
      { title: "Aula 09 - Injúria Renal Aguda (IRA) — Critérios KDIGO e Manejo Volêmico", duration: "47 min" },
      { title: "Aula 10 - Glomerulopatias: Síndrome Nefrótica versus Síndrome Nefrítica", duration: "53 min" },
      { title: "Aula 11 - Distúrbios do Sódio: Hiponatremia, Hipernatremia e Correção Segura", duration: "51 min" },
      { title: "Aula 12 - Distúrbios do Potássio e Gasometria Arterial na Prática", duration: "45 min" }
    ]
  },
  {
    title: "Módulo 04 — Gastroenterologia & Hepatologia",
    description: "Hemorragia digestiva alta e baixa, cirrose, hipertensão portal e pancreatite.",
    lessons: [
      { title: "Aula 13 - Hemorragia Digestiva Alta Varicosa e Não-Varicosa", duration: "55 min" },
      { title: "Aula 14 - Doença do Refluxo Gastroesofágico e Doença Ulcerosa Péptica", duration: "42 min" },
      { title: "Aula 15 - Cirrose Hepática, Ascite, Peritonite Bacteriana Espontânea e Encefalopatia", duration: "58 min" },
      { title: "Aula 16 - Pancreatite Aguda & Litíase Biliar Complicada", duration: "48 min" }
    ]
  },
  {
    title: "Módulo 05 — Endocrinologia & Metabolismo",
    description: "Diabetes Mellitus, cetoacidose diabética, tireoidopatias e doenças da adrenal.",
    lessons: [
      { title: "Aula 17 - Diabetes Mellitus: Metas Glicêmicas, Antidiabéticos e Insulinas", duration: "52 min" },
      { title: "Aula 18 - Crises Hiperglicêmicas: Cetoacidose Diabética e Estado Hiperosmolar", duration: "46 min" },
      { title: "Aula 19 - Hipotireoidismo, Hipertireoidismo e Doenças Tireoidianas", duration: "50 min" },
      { title: "Aula 20 - Síndrome de Cushing, Insuficiência Adrenal e Nódulo de Tireoide", duration: "44 min" }
    ]
  },
  {
    title: "Módulo 06 — Infectologia & Doenças Prevalentes",
    description: "Sepse, infecção pelo HIV, meningites agudas e infecções bacterianas comunitárias.",
    lessons: [
      { title: "Aula 21 - Sepse e Choque Séptico: Protocolo Surviving Sepsis 1 Hora", duration: "58 min" },
      { title: "Aula 22 - Infecção pelo HIV: Diagnóstico, TARV e Doenças Oportunistas", duration: "54 min" },
      { title: "Aula 23 - Meningites Bacterianas e Virais: Punção Lombar e Antibioticoterapia", duration: "48 min" },
      { title: "Aula 24 - Arboviroses: Dengue Grave, Febre Amarela e Manejo Volêmico", duration: "43 min" }
    ]
  },
  {
    title: "Módulo 07 — Cirurgia Geral & Trauma (ATLS)",
    description: "Atendimento inicial ao politraumatizado, abdome agudo cirúrgico e hérnias.",
    lessons: [
      { title: "Aula 25 - Atendimento Inicial ao Politraumatizado: ABCDE do ATLS", duration: "57 min" },
      { title: "Aula 26 - Abdome Agudo Inflamatório: Apendicite, Colecistite e Diverticulite", duration: "51 min" },
      { title: "Aula 27 - Abdome Agudo Obstrutivo, Perfurativo e Isquemia Mesentérica", duration: "49 min" },
      { title: "Aula 28 - Hérnias da Parede Abdominal e Inguinais: Classificação e Técnicas", duration: "46 min" }
    ]
  },
  {
    title: "Módulo 08 — Pediatria & Neonatologia",
    description: "Reanimação neonatal, puericultura, infecções respiratórias e diarreia aguda.",
    lessons: [
      { title: "Aula 29 - Reanimação Neonatal na Sala de Parto (Diretrizes SBP)", duration: "50 min" },
      { title: "Aula 30 - Puericultura, Marcos do Desenvolvimento e Imunizações", duration: "47 min" },
      { title: "Aula 31 - Bronquiolite Viral Aguda, Asma Pediátrica e Pneumonias na Infância", duration: "53 min" },
      { title: "Aula 32 - Doenças Exantemáticas da Infância & Diarreia Aguda com Desidratação", duration: "49 min" }
    ]
  },
  {
    title: "Módulo 09 — Ginecologia & Obstetrícia",
    description: "Pré-natal, pré-eclâmpsia, hemorragias gestacionais e oncologia ginecológica.",
    lessons: [
      { title: "Aula 33 - Assistência Pré-Natal e Síndromes Hipertensivas da Gravidez", duration: "55 min" },
      { title: "Aula 34 - Hemorragias da Primeira e Segunda Metade da Gestação", duration: "52 min" },
      { title: "Aula 35 - Sangramento Uterino Anormal (PALM-COEIN) e Anticoncepção", duration: "48 min" },
      { title: "Aula 36 - Rastreamento e Conduta no Câncer de Colo Uterino e Mama", duration: "51 min" }
    ]
  },
  {
    title: "Módulo 10 — Medicina Preventiva & Saúde Coletiva",
    description: "Epidemiologia clínica, estudos científicos, SUS e vigilância em saúde.",
    lessons: [
      { title: "Aula 37 - Estudos Epidemiológicos (Coorte, Caso-Controle, Ensaio Clínico)", duration: "53 min" },
      { title: "Aula 38 - Testes Diagnósticos: Sensibilidade, Especificidade, VPP e VPN", duration: "46 min" },
      { title: "Aula 39 - Sistema Único de Saúde (SUS): Princípios, Leis 8.080/8.142 e Financiamento", duration: "50 min" },
      { title: "Aula 40 - Vigilância Epidemiológica, Notificação Compulsória e Saúde do Trabalhador", duration: "45 min" }
    ]
  },
  {
    title: "Módulo 11 — Resolução de Questões & Provas de Residência",
    description: "Treinamento intensivo das bancas USP, ENARE, SURCE, UNICAMP e SUS-SP.",
    lessons: [
      { title: "Aula 41 - Resolução Comentada de Questões: Clínica Médica & Cirurgia", duration: "60 min" },
      { title: "Aula 42 - Resolução Comentada de Questões: Pediatria, GO e Preventiva", duration: "58 min" },
      { title: "Aula 43 - Análise de Pegadinhas Frequentes e Critérios de Desempate", duration: "52 min" },
      { title: "Aula 44 - Simulado Geral com Gabarito e Justificativa Ponto a Ponto", duration: "62 min" }
    ]
  },
  {
    title: "Módulo 12 — Revisão de Véspera & Condutas Práticas",
    description: "Tópicos de altíssima probabilidade e revisão rápida de véspera de prova.",
    lessons: [
      { title: "Aula 45 - Revisão Rápida dos 20 Temas Mais Cobrados no Brasil", duration: "65 min" },
      { title: "Aula 46 - Fluxogramas Decisórios de Emergência e Prescrição Rápida", duration: "54 min" },
      { title: "Aula 47 - Doses de Ataque e Ajustes Farmacológicos em Prova", duration: "48 min" },
      { title: "Aula 48 - Encerramento do Ciclo Teórico e Orientações para a Prova", duration: "40 min" }
    ]
  }
];

let globalLessonCounter = 0;

const updatedCourses = rawCourses.map((course, cIdx) => {
  // Personaliza módulos de acordo com a área do curso
  const isPratica = course.category?.includes("Prática") || course.title.toLowerCase().includes("prática") || course.title.toLowerCase().includes("osce");
  const isEmergencia = course.title.toLowerCase().includes("emergência") || course.title.toLowerCase().includes("pronto-socorro") || course.title.toLowerCase().includes("ventilação");
  const isEletro = course.title.toLowerCase().includes("ecg") || course.title.toLowerCase().includes("medeletro");

  let courseModules = [];

  if (isEletro) {
    courseModules = [
      {
        title: "Módulo 01 — Fundamentos do ECG & Vetocardiografia",
        description: "Derivações, eixo cardíaco, ondas P, complexo QRS, segmento ST e onda T.",
        lessons: [
          { title: "Aula 01 - Bases da Eletrofisiologia Cardíaca e Derivações", duration: "45 min" },
          { title: "Aula 02 - Cálculo Rápido do Eixo Cardíaco no Plano Frontal", duration: "40 min" },
          { title: "Aula 03 - Sobrecargas Atriais e Ventriculares ao ECG", duration: "50 min" },
          { title: "Aula 04 - Bloqueios de Ramo Direito e Esquerdo (BRD e BRE)", duration: "48 min" }
        ]
      },
      {
        title: "Módulo 02 — Isquemia, Lesão e Necrose (Infarto Agudo)",
        description: "Reconhecimento imediato do supra de ST, equivalentes e artérias culpadas.",
        lessons: [
          { title: "Aula 05 - Critérios Clássicos de IAM com Supra de ST", duration: "55 min" },
          { title: "Aula 06 - Topografia Coronariana e Identificação da Artéria Culpada", duration: "52 min" },
          { title: "Aula 07 - Equivalentes de Supra: Padrão de Wellens, Winter e De Winter", duration: "49 min" },
          { title: "Aula 08 - ECG no Tromboembolismo Pulmonar (S1Q3T3 e Sobrecarga de VD)", duration: "46 min" }
        ]
      },
      {
        title: "Módulo 03 — Bradiarritmias & Bloqueios Atrioventriculares",
        description: "BAV de 1º grau, Mobitz I, Mobitz II, BAVT e indicação de marcapasso.",
        lessons: [
          { title: "Aula 09 - Bradiarritmias Sinusais e Doença do Nó Sinusal", duration: "42 min" },
          { title: "Aula 10 - Bloqueios AV de 1º, 2º e 3º Graus (BAVT)", duration: "54 min" },
          { title: "Aula 11 - Manejo Farmacológico com Atropina e Marcapasso Transcutâneo", duration: "47 min" },
          { title: "Aula 12 - Casos Clínicos Desafiadores de Bradiarritmias", duration: "50 min" }
        ]
      },
      {
        title: "Módulo 04 — Taquiarritmias com QRS Estreito e Largo",
        description: "Fibrilação atrial, flutter, taquicardia supraventricular e taquicardia ventricular.",
        lessons: [
          { title: "Aula 13 - Taquiarritmias com QRS Estreito: TPSV e Manobras Vagais", duration: "52 min" },
          { title: "Aula 14 - Fibrilação Atrial e Flutter Atrial: Controle de Frequência vs Ritmo", duration: "58 min" },
          { title: "Aula 15 - Taquicardias com QRS Largo: TV monomórfica vs polimórfica (Torsades)", duration: "55 min" },
          { title: "Aula 16 - Cardioversão Elétrica Sincronizada vs Desfibrilação", duration: "48 min" },
          { title: "Aula 17 - Treinamento Prático: Laudos de ECG Comentados em Tempo Real", duration: "60 min" }
        ]
      }
    ];
  } else if (isEmergencia) {
    courseModules = [
      {
        title: "Módulo 01 — Via Aérea Difícil & Intubação em Sequência Rápida",
        description: "Sedativos, bloqueadores neuromusculares, videolaringoscopia e cricotireoidostomia.",
        lessons: [
          { title: "Aula 01 - Os 7 Ps da Intubação em Sequência Rápida (ISR)", duration: "52 min" },
          { title: "Aula 02 - Farmacologia dos Sedativos: Cetamina, Etomidato e Propofol", duration: "48 min" },
          { title: "Aula 03 - Bloqueadores Neuromusculares: Succinilcolina vs Rocurônio", duration: "44 min" },
          { title: "Aula 04 - Algoritmo de Via Aérea Difícil e Cricotireoidostomia Cirúrgica", duration: "56 min" }
        ]
      },
      {
        title: "Módulo 02 — Choque Circulatório & Drogas Vasoativas",
        description: "Diferenciação dos 4 tipos de choque, noradrenalina, vasopressina e dobutamina.",
        lessons: [
          { title: "Aula 05 - Fisiopatologia e Diferenciação do Choque (Séptico, Cardiogênico, Hipovolêmico)", duration: "54 min" },
          { title: "Aula 06 - Noradrenalina e Vasopressina: Doses e Titulação Segura", duration: "49 min" },
          { title: "Aula 07 - Dobutamina e Inotrópicos no Choque Cardiogênico Agudo", duration: "46 min" },
          { title: "Aula 08 - Monitorização Hemodinâmica e Ressuscitação Guiada por Metas", duration: "51 min" }
        ]
      },
      {
        title: "Módulo 03 — Ventilação Mecânica Invasiva e Não-Invasiva",
        description: "Modos ventilatórios VCV e PCV, PEEP, titulação em SDRA e assincronias.",
        lessons: [
          { title: "Aula 09 - Princípios Básicos e Programação Inicial do Ventilador", duration: "50 min" },
          { title: "Aula 10 - Modos Ventilatórios: Volume Controlado vs Pressão Controlada", duration: "48 min" },
          { title: "Aula 11 - Ventilação Protetora na SDRA e Titulação da PEEP Ideal", duration: "55 min" },
          { title: "Aula 12 - Diagnóstico e Resolução das Principais Assincronias Ventilatórias", duration: "53 min" }
        ]
      },
      {
        title: "Módulo 04 — Parada Cardiorrespiratória & Cuidados Pós-Ressuscitação",
        description: "Ritmos chocáveis e não chocáveis, compressões de alta qualidade e controle de temperatura.",
        lessons: [
          { title: "Aula 13 - PCR em Ritmos Chocáveis: FV e TV sem Pulso", duration: "48 min" },
          { title: "Aula 14 - PCR em Ritmos Não-Chocáveis: AESP e Assistolia (Causas 5Hs e 5Ts)", duration: "52 min" },
          { title: "Aula 15 - Cuidados Pós-PCR e Controle Direcionado de Temperatura", duration: "45 min" },
          { title: "Aula 16 - Casos Clínicos Críticos de Plantão de Emergência Comentados", duration: "60 min" }
        ]
      }
    ];
  } else if (isPratica) {
    courseModules = [
      {
        title: "Módulo 01 — Estações Práticas de Clínica Médica",
        description: "Comunicação de notícias difíceis, anamnese dirigida e exame físico estruturado.",
        lessons: [
          { title: "Aula 01 - Protocolo SPIKES: Comunicação de Más Notícias na Prova Prática", duration: "46 min" },
          { title: "Aula 02 - Estação de Dor Torácica e Solicitação de Exames Complementares", duration: "50 min" },
          { title: "Aula 03 - Estação de Dispneia Aguda e Insuficiência Cardíaca Descompensada", duration: "48 min" },
          { title: "Aula 04 - Estação de Diabetes Descompensado e Prescrição de Insulina", duration: "44 min" }
        ]
      },
      {
        title: "Módulo 02 — Estações Práticas de Cirurgia & Trauma",
        description: "Drenagem de tórax, suturas, ATLS e estações de atendimento inicial.",
        lessons: [
          { title: "Aula 05 - Estação de Atendimento Inicial ao Politraumatizado (ATLS)", duration: "52 min" },
          { title: "Aula 06 - Procedimento: Drenagem Torácica Fechada e Paracentese", duration: "47 min" },
          { title: "Aula 07 - Técnicas de Paramentação, Assepsia e Fios de Sutura", duration: "43 min" },
          { title: "Aula 08 - Estação de Abdome Agudo: Apendicite e Exame Físico Abdominal", duration: "49 min" }
        ]
      },
      {
        title: "Módulo 03 — Estações Práticas de Pediatria & GO",
        description: "Reanimação neonatal, puericultura, partograma e consulta ginecológica.",
        lessons: [
          { title: "Aula 09 - Estação de Reanimação Neonatal em Manequim Realístico", duration: "54 min" },
          { title: "Aula 10 - Consulta de Puericultura e Preenchimento da Caderneta da Criança", duration: "48 min" },
          { title: "Aula 11 - Exame Ginecológico, Coleta de Papanicolau e Inserção de DIU", duration: "51 min" },
          { title: "Aula 12 - Interpretação e Preenchimento do Partograma na Prática", duration: "53 min" }
        ]
      },
      {
        title: "Módulo 04 — Estações de Medicina Preventiva & Simulações Reais",
        description: "Consulta ética, declaração de óbito, termo de consentimento e checklists.",
        lessons: [
          { title: "Aula 13 - Preenchimento Correto da Declaração de Óbito (Causas Básica e Imediata)", duration: "45 min" },
          { title: "Aula 14 - Notificação Compulsória e Abordagem Familiar em Visita Domiciliar", duration: "47 min" },
          { title: "Aula 15 - Simulado Completo de 5 Estações Sequenciais Cronometradas", duration: "65 min" }
        ]
      }
    ];
  } else {
    // Curso Teórico Padrão com grade ampliada de 12 módulos e 48 aulas completas!
    courseModules = standardModulesTemplate.map((m) => ({
      title: m.title,
      description: m.description,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        duration: l.duration
      }))
    }));
  }

  // Atribui URLs de streaming funcionais e IDs únicos determinísticos
  const enrichedModules = courseModules.map((mod, mIdx) => ({
    title: mod.title,
    description: mod.description,
    lessons: mod.lessons.map((les, lIdx) => {
      globalLessonCounter++;
      return {
        id: `${course.id}-m${mIdx + 1}-l${lIdx + 1}`,
        title: les.title,
        duration: les.duration || "45 min",
        videoUrl: getVideoUrl(globalLessonCounter),
        summary: `${les.title} com fundamentos fisiopatológicos, semiologia armada e diretrizes clínicas atualizadas para 2026.`,
        keyPoints: [
          "Fisiopatologia celular e fatores de risco de alta incidência",
          "Algoritmo decisório e propedêutica armada de 1ª linha",
          "Conduta terapêutica medicamentosa e doses de manutenção",
          "Resolução justificada de casos típicos das provas de Residência"
        ]
      };
    })
  }));

  const totalLessonsInCourse = enrichedModules.reduce((acc, m) => acc + m.lessons.length, 0);

  return {
    ...course,
    modulesCount: enrichedModules.length,
    totalLessons: totalLessonsInCourse,
    modules: enrichedModules
  };
});

fs.writeFileSync("courses.json", JSON.stringify(updatedCourses, null, 2), "utf8");

const totalNewLessons = updatedCourses.reduce((acc, c) => acc + c.totalLessons, 0);
console.log(`✓ courses.json atualizado com sucesso!`);
console.log(`Total de cursos: ${updatedCourses.length}`);
console.log(`Total geral de videoaulas estruturadas no acervo: ${totalNewLessons}`);
