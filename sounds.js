/**
 * SOUNDS.JS
 * Gerenciador Unificado de Áudio.
 * Combina: Uploads, Persistência em Base64, Fallbacks e Sincronia Visual.
 * VERSÃO: V6.3 - WEB AUDIO API (NON-BLOCKING)
 */

window.SoundManager = {
    
    audioCtx: null, // Contexto de áudio para mixagem sem interrupção

    // Durações para travar a UI (sincronia visual)
    durations: {
        click: 200,      
        xp: 1000,        
        levelup: 4000,   
        chest: 6000,
        coin: 500      
    },

    // Caminhos padrão caso o usuário não faça upload
    defaultPaths: {
        click: 'audio/Clique de botão.mp3',
        xp: 'audio/Ganho de XP.mp3',
        levelup: 'audio/Level up.mp3',
        chest: 'audio/Ganho de baú (1).mp3',
        coin: 'audio/Moeda.mp3'
    },

    // Tipos suportados
    types: ['click', 'xp', 'levelup', 'chest', 'coin'],

    init: function() {
        // Inicializa a Web Audio API
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
        } catch (e) {
            console.warn("[SoundManager] Web Audio API não suportada.");
        }

        document.addEventListener('SiteC_DataReady', () => {
            this.ensureSettingsIntegrity();
            this.loadSettingsToUI();
            this.setupListeners();
        });
    },

    // Garante que o objeto de configurações exista no save
    ensureSettingsIntegrity: function() {
        if (!window.GlobalApp.data.settings) window.GlobalApp.data.settings = {};
        if (!window.GlobalApp.data.settings.sounds) {
            window.GlobalApp.data.settings.sounds = {
                click: { url: null, volume: 50 },
                xp: { url: null, volume: 50 },
                levelup: { url: null, volume: 50 },
                chest: { url: null, volume: 50 },
                coin: { url: null, volume: 50 }
            };
        } else if (!window.GlobalApp.data.settings.sounds.coin) {
            // Garante integridade se o save já existir mas sem o novo som
            window.GlobalApp.data.settings.sounds.coin = { url: null, volume: 50 };
        }
    },

    setupListeners: function() {
        this.types.forEach(type => {
            // Upload (Input File)
            const uploadInput = document.getElementById(`upload-${type}-sound`);
            if (uploadInput) {
                uploadInput.addEventListener('change', (e) => this.handleUpload(e, type));
            }

            // Volume (Range Slider)
            const volInput = document.getElementById(`vol-${type}`);
            if (volInput) {
                volInput.addEventListener('input', (e) => this.handleVolumeChange(e, type));
            }
        });
    },

    loadSettingsToUI: function() {
        const settings = window.GlobalApp.data.settings.sounds;
        this.types.forEach(type => {
            if (settings[type]) {
                const volInput = document.getElementById(`vol-${type}`);
                if (volInput) {
                    volInput.value = settings[type].volume;
                }
            }
        });
    },

    /**
     * Toca o som (Customizado ou Padrão) usando Web Audio API.
     * Retorna Promise para sincronia visual.
     */
    play: function(key) {
        return new Promise(async resolve => {
            const settings = window.GlobalApp.data.settings.sounds[key] || {};
            
            // 1. Prioridade: Som Customizado (Base64) > Som Padrão (Arquivo)
            let sourceUrl = settings.url;
            if (!sourceUrl) {
                sourceUrl = this.defaultPaths[key];
            }

            // 2. Tocar Áudio via Web Audio API (Mixagem)
            if (sourceUrl && this.audioCtx) {
                try {
                    // Retoma o contexto se suspenso (necessário em browsers modernos mobile)
                    if (this.audioCtx.state === 'suspended') {
                        await this.audioCtx.resume();
                    }

                    // Fetch do áudio (suporta URL local e Base64)
                    const response = await fetch(sourceUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

                    // Configura nós de áudio
                    const sourceNode = this.audioCtx.createBufferSource();
                    sourceNode.buffer = audioBuffer;

                    const gainNode = this.audioCtx.createGain();
                    const vol = (settings.volume !== undefined ? settings.volume : 50) / 100;
                    gainNode.gain.value = vol;

                    // Conecta: Source -> Gain -> Saída
                    sourceNode.connect(gainNode);
                    gainNode.connect(this.audioCtx.destination);

                    sourceNode.start(0);

                } catch (e) {
                    console.warn(`[SoundManager] Falha ao tocar ${key}:`, e);
                }
            } else {
                console.warn(`[SoundManager] Nenhum áudio ou API indisponível para: ${key}`);
            }

            // 3. Resolver Promise baseada na duração visual configurada
            const duration = this.durations[key] || 500;
            setTimeout(() => {
                resolve();
            }, duration);
        });
    },

    /**
     * Retorna a duração configurada (usado pelo XPManager para animação da barra)
     */
    getDuration: function(key) {
        return this.durations[key] || 500;
    },

    // --- HANDLERS DE CONFIGURAÇÃO ---

    handleUpload: async function(event, type) {
        const file = event.target.files[0];
        if (!file) return;

        // Limite de segurança (700KB para dar margem)
        if (file.size > 700 * 1024) {
            await alert("⚠️ O arquivo é muito grande! Escolha um som curto (menos de 700KB) para não travar o navegador.");
            event.target.value = ''; // Limpa input
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            const base64Audio = e.target.result;
            
            // Salva no GlobalApp
            window.GlobalApp.data.settings.sounds[type].url = base64Audio;
            window.GlobalApp.saveData();

            // Feedback imediato
            this.play(type);
        };

        reader.readAsDataURL(file);
    },

    handleVolumeChange: function(event, type) {
        const newVol = parseInt(event.target.value);
        
        window.GlobalApp.data.settings.sounds[type].volume = newVol;
        window.GlobalApp.saveData();

        // Debounce para não tocar loucamente enquanto arrasta
        if (this.volumeTimeout) clearTimeout(this.volumeTimeout);
        this.volumeTimeout = setTimeout(() => {
            this.play(type);
        }, 200);
    }
};

window.SoundManager.init();
